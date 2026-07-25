#!/usr/bin/env node
/**
 * DOM Runner - Linux
 *
 * Executa um arquivo .js com DOM real (Chromium headless) e imprime a saida
 * no console. Nenhuma janela de navegador e aberta.
 *
 * Uso:
 *   node run.js caminho/para/arquivo.js
 *
 * Como ele decide qual HTML carregar:
 *   1. Um .html da pasta declara <script src> apontando para o seu .js
 *      -> carrega esse HTML inteiro, como voce escreveu
 *   2. Existe exatamente um .html na pasta, mas ele nao aponta para o seu .js
 *      -> carrega esse HTML com JavaScript desligado, so para dar estrutura
 *         ao DOM, e roda apenas o seu arquivo
 *   3. Nao ha .html
 *      -> documento em branco e roda apenas o seu arquivo
 *
 * Codigo assincrono: o runner detecta sozinho quando a pagina terminou.
 * Nao ha tempo de espera para configurar.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  console.error('ERRO: Puppeteer nao encontrado.');
  console.error('Rode o instalador novamente: bash instalar.sh');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Argumentos
//
// Dois tratamentos sao necessarios aqui:
//
// 1. O Code Runner ja envolve o caminho em aspas ao substituir
//    $fullFileName. Como o comando usa aspas simples (para que o shell nao
//    interprete metacaractere nenhum), essas aspas chegam como parte do
//    texto e precisam ser removidas.
//
// 2. Em configuracoes que perdem a citacao, um caminho com espaco chega
//    quebrado em varios argumentos; nesse caso reconstruimos juntando.
// ---------------------------------------------------------------------------

function semAspas(s) {
  let t = String(s).trim();
  while (
    t.length >= 2 &&
    ((t[0] === '"' && t[t.length - 1] === '"') ||
     (t[0] === "'" && t[t.length - 1] === "'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

const args = process.argv.slice(2);

const candidatos = [];
if (args.length) candidatos.push(semAspas(args[0]));
if (args.length > 1) candidatos.push(semAspas(args.join(' ')));

let alvo = '';
for (const c of candidatos) {
  if (c && fs.existsSync(path.resolve(c))) {
    alvo = path.resolve(c);
    break;
  }
}

if (!alvo) {
  console.error(
    'ERRO: arquivo nao encontrado ->',
    candidatos[candidatos.length - 1] || '(nenhum argumento)'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Recusa de caminhos que quebram o shell
//
// O editor monta um comando de shell com o caminho entre aspas simples.
// Dentro delas o shell nao interpreta $, crase, aspas duplas nem ponto e
// virgula - mas uma aspa simples no nome encerra a citacao e o restante
// vira comando. Esta checagem e a ultima linha de defesa: quando ela
// dispara, o caminho ja chegou intacto, e recusar evita comportamento
// imprevisivel daqui para a frente.
// ---------------------------------------------------------------------------

const PERIGOSOS = /['"`;\r\n]|\$\(/;

if (PERIGOSOS.test(alvo)) {
  console.error('ERRO: o caminho contem caractere que quebra a linha de comando.');
  console.error('  caminho: ' + alvo);
  console.error("  renomeie removendo:  '  \"  `  ;  $(  e quebras de linha");
  process.exit(1);
}

const pasta = path.dirname(alvo);
const nomeJs = path.basename(alvo);

// ---------------------------------------------------------------------------
// Descoberta do HTML
//
// O casamento e por <script src>, comparando o nome do arquivo inteiro.
// Comparar por substring faria "a.js" casar com um HTML que so cita
// "data.js", escolhendo a pagina errada.
// ---------------------------------------------------------------------------

function declaraScript(conteudo, nome) {
  const re = /<script\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m;
  while ((m = re.exec(conteudo)) !== null) {
    const src = (m[1] || m[2] || m[3] || '').trim();
    if (!src) continue;
    const semQuery = src.split('#')[0].split('?')[0];
    const base = semQuery.split('/').pop();
    if (base === nome) return true;
  }
  return false;
}

const LIMITE_LEITURA = 2 * 1024 * 1024; // 2 MB por arquivo HTML

let htmls = [];
try {
  htmls = fs.readdirSync(pasta).filter(f => /\.html?$/i.test(f));
} catch (e) {
  htmls = [];
}

let htmlEscolhido = null;
let jaReferencia = false;

for (const f of htmls) {
  let conteudo = '';
  try {
    const caminho = path.join(pasta, f);
    if (fs.statSync(caminho).size > LIMITE_LEITURA) continue;
    conteudo = fs.readFileSync(caminho, 'utf8');
  } catch (e) {
    continue;
  }
  if (declaraScript(conteudo, nomeJs)) {
    htmlEscolhido = f;
    jaReferencia = true;
    break;
  }
}

if (!htmlEscolhido && htmls.length === 1) {
  htmlEscolhido = htmls[0];
}

// ---------------------------------------------------------------------------
// Instrumentacao injetada na pagina
//
// 1. Serializa cada console.* no instante do log, para preservar o antes e o
//    depois de cada alteracao no DOM.
// 2. Conta operacoes assincronas em aberto, para o runner saber sozinho
//    quando a pagina terminou de trabalhar.
// ---------------------------------------------------------------------------

function instrumentar() {
  // ---- 1. console legivel ------------------------------------------------
  const serial = o => {
    try {
      if (o instanceof Element) return o.outerHTML;
      if (o instanceof Node) return '#' + o.nodeName + ' ' + (o.textContent || '');
      if (typeof o === 'function') return '[function ' + (o.name || 'anonima') + ']';
      if (typeof o === 'object' && o !== null) return JSON.stringify(o, null, 2);
      return String(o);
    } catch (e) {
      return String(o);
    }
  };

  ['log', 'info', 'warn', 'error'].forEach(m => {
    const original = console[m].bind(console);
    console[m] = (...a) => original(a.map(serial).join(' '));
  });

  // ---- 2. contador de pendencias -----------------------------------------
  let pendentes = 0;
  const cancelaTimeout = new Map();
  const intervalosVivos = new Set();

  window.__domRunnerEstado = () => ({
    pendentes: pendentes,
    intervalos: intervalosVivos.size,
    pronto: document.readyState,
  });

  // setTimeout
  const _setTimeout = window.setTimeout.bind(window);
  const _clearTimeout = window.clearTimeout.bind(window);

  window.setTimeout = function (fn, atraso) {
    if (typeof fn !== 'function') {
      return _setTimeout.apply(window, arguments);
    }
    const extras = Array.prototype.slice.call(arguments, 2);
    pendentes++;
    let baixado = false;
    const baixar = () => {
      if (!baixado) { baixado = true; pendentes--; }
    };
    const id = _setTimeout(function () {
      baixar();
      cancelaTimeout.delete(id);
      fn.apply(this, extras);
    }, atraso);
    cancelaTimeout.set(id, baixar);
    return id;
  };

  window.clearTimeout = function (id) {
    const baixar = cancelaTimeout.get(id);
    if (baixar) { baixar(); cancelaTimeout.delete(id); }
    return _clearTimeout(id);
  };

  // setInterval: nao decrementa sozinho; so sai da conta quando for limpo.
  const _setInterval = window.setInterval.bind(window);
  const _clearInterval = window.clearInterval.bind(window);

  window.setInterval = function () {
    const id = _setInterval.apply(window, arguments);
    intervalosVivos.add(id);
    return id;
  };

  window.clearInterval = function (id) {
    intervalosVivos.delete(id);
    return _clearInterval(id);
  };

  // fetch
  if (typeof window.fetch === 'function') {
    const _fetch = window.fetch.bind(window);
    window.fetch = function () {
      pendentes++;
      let baixado = false;
      const baixar = () => { if (!baixado) { baixado = true; pendentes--; } };
      let p;
      try {
        p = _fetch.apply(window, arguments);
      } catch (e) {
        baixar();
        throw e;
      }
      return p.then(
        r => { baixar(); return r; },
        e => { baixar(); throw e; }
      );
    };
  }

  // XMLHttpRequest
  if (typeof window.XMLHttpRequest === 'function') {
    const _send = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.send = function () {
      pendentes++;
      let baixado = false;
      const baixar = () => { if (!baixado) { baixado = true; pendentes--; } };
      this.addEventListener('loadend', baixar);
      try {
        return _send.apply(this, arguments);
      } catch (e) {
        baixar();
        throw e;
      }
    };
  }
}

// ---------------------------------------------------------------------------
// Espera ativa: acaba quando a pagina fica ociosa, nao quando o relogio bate.
// ---------------------------------------------------------------------------

async function esperarOcioso(page, limiteMs) {
  const inicio = Date.now();
  let estaveis = 0;

  while (Date.now() - inicio < limiteMs) {
    let estado;
    try {
      estado = await page.evaluate(() =>
        window.__domRunnerEstado
          ? window.__domRunnerEstado()
          : { pendentes: 0, intervalos: 0, pronto: document.readyState }
      );
    } catch (e) {
      // Pagina navegou ou fechou no meio: nada mais a esperar.
      return { ocioso: true, motivo: 'pagina-encerrada' };
    }

    const quieto =
      estado.pendentes === 0 &&
      estado.intervalos === 0 &&
      estado.pronto !== 'loading';

    if (quieto) {
      estaveis++;
      // Tres leituras seguidas em silencio (~150 ms) para nao cortar
      // uma cadeia de timeouts que reagenda logo em seguida.
      if (estaveis >= 3) return { ocioso: true, motivo: 'ocioso' };
    } else {
      estaveis = 0;
    }

    await new Promise(r => setTimeout(r, 50));
  }

  return { ocioso: false, motivo: 'limite' };
}

// ---------------------------------------------------------------------------
// Limite de seguranca contra laco infinito.
// Nao e tempo de espera: script que termina sozinho nunca chega perto dele.
// ---------------------------------------------------------------------------

const LIMITE_PADRAO = 60000;

function lerLimite() {
  const bruto = process.env.DOM_RUNNER_LIMITE;
  if (!bruto) return LIMITE_PADRAO;

  const n = parseInt(bruto, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.warn(
      '[dom-runner] DOM_RUNNER_LIMITE invalido (' + bruto + '); ' +
      'usando ' + LIMITE_PADRAO + ' ms.'
    );
    return LIMITE_PADRAO;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Abertura do navegador
//
// O sandbox do Chromium e a contencao principal do navegador: sem ele, uma
// falha no renderizador vira execucao no seu usuario. Tentamos com sandbox
// e so caimos para o modo sem sandbox se o sistema nao permitir - o que
// acontece em containers e em distros que restringem user namespaces.
// ---------------------------------------------------------------------------

async function abrirNavegador() {
  const base = ['--disable-gpu', '--disable-dev-shm-usage'];

  try {
    const browser = await puppeteer.launch({ headless: 'new', args: base });
    return { browser, comSandbox: true };
  } catch (primeiroErro) {
    try {
      const browser = await puppeteer.launch({
        headless: 'new',
        args: base.concat(['--no-sandbox']),
      });
      console.warn(
        '[dom-runner] sandbox indisponivel neste sistema; seguindo sem ele.'
      );
      return { browser, comSandbox: false };
    } catch (segundoErro) {
      throw primeiroErro;
    }
  }
}

// ---------------------------------------------------------------------------
// Execucao
// ---------------------------------------------------------------------------

(async () => {
  let browser;
  try {
    const aberto = await abrirNavegador();
    browser = aberto.browser;

    const page = await browser.newPage();

    // Quem executa o que:
    //
    //   - O HTML declara o seu .js  -> a pagina e a dona do script. Carregamos
    //     normalmente e tudo que o HTML declara roda, como voce escreveu.
    //
    //   - O HTML NAO declara o seu .js -> ele esta ali so para dar estrutura
    //     ao DOM. Carregamos com JavaScript desligado, para que os scripts
    //     DELE nao executem, e depois injetamos apenas o seu arquivo.
    //
    //   - Nao ha HTML -> documento em branco e injecao do seu arquivo.
    const injetar = !htmlEscolhido || !jaReferencia;

    if (!injetar) {
      // A pagina e a dona: instrumentamos antes que qualquer coisa rode.
      await page.evaluateOnNewDocument(instrumentar);
    }

    page.on('console', msg => {
      const tipo = msg.type();
      if (tipo === 'error') console.error(msg.text());
      else if (tipo === 'warning') console.warn(msg.text());
      else console.log(msg.text());
    });

    page.on('pageerror', e => console.error('ERRO:', e.message));

    if (htmlEscolhido) {
      if (injetar) await page.setJavaScriptEnabled(false);

      // pathToFileURL cuida da codificacao: '#', '?' e '%' no caminho
      // quebrariam a URL se fossem concatenados na mao.
      const url = pathToFileURL(path.join(pasta, htmlEscolhido)).href;
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      if (injetar) await page.setJavaScriptEnabled(true);
    } else {
      await page.setContent('<!doctype html><html><body></body></html>');
    }

    if (injetar) {
      await page.evaluate(instrumentar);
      await page.addScriptTag({ path: alvo });
    }

    const limite = lerLimite();
    const r = await esperarOcioso(page, limite);

    if (!r.ocioso) {
      console.warn(
        '[dom-runner] encerrado pelo limite de ' + Math.round(limite / 1000) +
        's: ainda havia trabalho pendente (setInterval sem clearInterval, ' +
        'requisicao travada ou laco infinito).'
      );
    }
  } catch (err) {
    console.error('FALHA NO RUNNER:', err.message);
    process.exitCode = 1;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) { /* ignora */ }
    }
  }
})();
