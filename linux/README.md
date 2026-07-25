# DOM Runner — Linux

Rode JavaScript com **DOM de verdade** direto do seu editor, com a saída caindo no painel de output. Sem abrir navegador, sem abrir aba, sem alternar de janela.

```js
const titulo = document.getElementById('titulo');
console.log(doc.textContent);
doc.innerText = "Teste2";
console.log(doc.textContent)
```

`Ctrl+Alt+N` e a saída aparece ali mesmo:

```
Olá
Funciona
```

> Esta pasta é autocontida. Tudo que o instalador do Linux precisa está aqui dentro.

---

## O problema que isso resolve

Quem está estudando DOM esbarra sempre na mesma parede: aperta o botão de rodar e recebe `ReferenceError: document is not defined`.

O motivo é que **DOM não faz parte do JavaScript**. `document`, `window`, `getElementById` — nada disso está na linguagem. São APIs que o *navegador* fornece. O Node.js é um runtime de JavaScript sem navegador, então não tem DOM nenhum.

As duas respostas que a internet costuma dar:

- **"Use o navegador"** — resolve, mas te obriga a sair do editor, abrir aba, abrir DevTools. Quem só quer conferir um `console.log` acaba fazendo isso trinta vezes por hora.
- **"Use jsdom"** — o jsdom é uma ferramenta séria, é o ambiente padrão do Jest. Mas ele *implementa* o DOM em vez de rodar o de verdade: não tem layout nem renderização, então `getBoundingClientRect()` devolve zeros e `offsetHeight` é sempre 0. Para quem está *aprendendo*, estudar contra uma réplica com lacunas é risco desnecessário.

O DOM Runner pega o terceiro caminho: roda o **Chromium de verdade**, em modo headless, e joga a saída no console do editor. DOM real, zero janelas.

## O que ele faz

- **Nada abre.** Nem janela, nem aba, nem preview. Só o texto no painel de output.
- **Configuração única.** Instalou, acabou. Arquivo novo, pasta nova, projeto novo — funciona sem tocar em config nenhuma.
- **Sem nome de arquivo obrigatório.** Nada de `index.html` fixo: ele descobre sozinho qual HTML pertence ao seu script.
- **Elementos legíveis no log.** `console.log(elemento)` imprime o HTML do elemento, não `JSHandle@node`.
- **Antes e depois preservados.** Logar um elemento e alterá-lo em seguida mostra os dois estados distintos, que é o que interessa quando se está estudando.

## Como ele encontra o HTML

Ao rodar um `.js`, ele decide nesta ordem:

1. Existe um `.html` na pasta que **declare `<script src>` apontando para o seu `.js`**? Usa esse, e a página roda inteira — todos os scripts que você declarou nela, como você escreveu.
2. Existe **exatamente um** `.html` na pasta, mas ele não cita o seu arquivo? Usa esse HTML **só para montar a estrutura do DOM**, com JavaScript desligado, e roda apenas o seu arquivo. Assim vários `.js` de estudo podem conviver na mesma pasta sem um atropelar o outro.
3. Não existe `.html` nenhum? Monta um documento em branco e injeta seu script — assim você pode estudar `createElement`, `appendChild` e afins sem criar HTML.

Nomes de arquivo são livres. `aula03.html`, `teste.html`, `revisao-dom.html` — tanto faz.

## Instalação

Requisito único: **Node.js**.

```bash
git clone https://github.com/morforio/dom-ide-runner.git
cd dom-ide-runner/linux
bash instalar.sh
```

> **Usa WSL?** Rode este instalador **dentro do WSL**, não no PowerShell. Windows e WSL são sistemas de arquivos diferentes, e um não enxerga o editor instalado no outro.

### O que o instalador faz

1. Confere Node.js e npm
2. Instala o Puppeteer em `~/.dom-runner` (baixa o Chromium, ~150 MB — só na primeira vez)
3. Copia o `run.js` para lá
4. Procura editores instalados em `~/.config`
5. Configura o Code Runner no `settings.json` de cada um, **fazendo backup datado antes**
6. Testa tudo, inclusive com pasta cujo nome tem espaço, e informa o resultado

Se a extensão Code Runner não puder ser instalada automaticamente (o CLI do editor precisa estar no PATH), o script avisa e você instala pelo painel de extensões: `formulahendry.code-runner`.

## Uso

Abra qualquer `.js` e tecle **`Ctrl+Alt+N`**.

A pasta [`exemplo/`](exemplo/) tem um caso pronto, comparando `innerText`, `innerHTML` e `textContent` lado a lado.

Fora do editor, pela linha de comando:

```bash
node ~/.dom-runner/run.js caminho/do/arquivo.js
```

## Editores suportados

Qualquer fork do VS Code que aceite a extensão Code Runner. Detectados automaticamente:

| Editor | Caminho da configuração |
|---|---|
| VS Code | `~/.config/Code/User` |
| VS Code Insiders | `~/.config/Code - Insiders/User` |
| VSCodium | `~/.config/VSCodium/User` |
| Cursor | `~/.config/Cursor/User` |
| Windsurf | `~/.config/Windsurf/User` |
| Trae | `~/.config/Trae/User` |
| Antigravity | `~/.config/Antigravity IDE/User` |

Para acrescentar outro, adicione uma linha na lista de `adicionar` dentro do `instalar.sh`.

## Arquivos desta pasta

```
linux/
├── instalar.sh          # o instalador
├── run.js               # o runner (Node + Puppeteer)
├── patch-settings.js    # edita o settings.json preservando o conteúdo
├── README.md
└── exemplo/
    ├── pagina.html
    └── exemplo.js
```

## Código assíncrono

Não há tempo de espera para configurar. O runner instrumenta a página e conta as operações assíncronas em aberto — `setTimeout`, `setInterval`, `fetch` e `XMLHttpRequest`. Enquanto houver qualquer uma pendente, ele espera; quando o contador zera e permanece zerado, ele encerra.

Um `fetch` de 4 segundos espera 4 segundos. Um script com só um `console.log` termina em milissegundos. Nenhum dos dois exige ajuste.

Um `setInterval` só sai da conta quando você chamar `clearInterval`. Se nunca chamar, o script rodaria para sempre — nesse caso um limite de segurança de 60 s encerra a execução e avisa o motivo no output. Esse limite não é tempo de espera: código que termina sozinho nunca chega perto dele. Para mexer nele (raro):

```bash
DOM_RUNNER_LIMITE=120000 node ~/.dom-runner/run.js arquivo.js
```

## Problemas comuns

**`ReferenceError: document is not defined`** — o Code Runner ainda está usando `node` puro. Reinicie o editor. Se persistir, confira se existe um `.vscode/settings.json` no projeto sobrescrevendo a configuração global.

**Caminho cortado no primeiro espaço** — já tratado: o runner reconstrói caminhos que chegaram partidos em vários argumentos. Se ainda acontecer, abra uma issue com o caminho completo.

**Chromium não abre** — faltam bibliotecas do sistema. Quando o teste falha, o instalador imprime o comando correto para Debian/Ubuntu, Fedora e Arch.

**O editor não foi detectado** — abra-o pelo menos uma vez (a pasta de configuração só é criada no primeiro uso) e rode o instalador de novo.

## Desinstalar

```bash
rm -rf ~/.dom-runner
```

E remova as chaves `code-runner.*` do `settings.json`, ou restaure um dos backups que o instalador deixou ao lado do original.

## Segurança

Este runner **executa o arquivo que estiver aberto**. Isso é o objetivo dele, e também o cuidado principal: `Ctrl+Alt+N` num `.js` de origem desconhecida executa aquele código na sua máquina.

O que foi feito para reduzir risco:

- **Sandbox do Chromium ligado.** Ele só é desligado se o sistema não permitir (containers e distros que restringem *user namespaces*), e nesse caso o runner avisa no output.
- **Comando com aspas simples.** O editor monta uma linha de shell com o caminho do arquivo. Com aspas duplas, um nome contendo `"`, `$( )` ou crase escaparia da citação e o resto viraria comando executado com o seu usuário. Com aspas simples nada disso é interpretado.
- **Caminhos perigosos recusados.** Sobra a própria aspa simples como risco; o runner recusa caminhos que contenham `'`, `"`, `` ` ``, `;`, `$(` ou quebra de linha, explicando o que renomear. Espaço, acento, parêntese, `&` e hífen continuam válidos.
- **Leitura de arquivos locais não foi habilitada.** A flag `--allow-file-access-from-files` não é usada, então uma página `file://` não consegue ler outros arquivos seus por `fetch`.

O que continua sendo sua responsabilidade:

- **Repositório de terceiro.** Se um `.html` da pasta declara `<script src>` para o seu arquivo, a página roda inteira — inclusive os outros scripts que ela declarar. Ao estudar código de outra pessoa, leia o HTML antes de rodar.
- **Rede.** Um script pode fazer `fetch` e enviar dados para fora. É comportamento normal de página web e não há como distinguir do legítimo.
- **Dependências.** O `puppeteer` traz uma árvore grande de pacotes npm e baixa um binário do Chromium. É o risco de cadeia de suprimentos padrão do ecossistema.

## Sobre o seu settings.json

O `settings.json` de editores baseados em VS Code aceita comentários, mas o formato precisa ser convertido para JSON válido na hora de alterá-lo. Consequência: **comentários que você tiver escrito nele são perdidos** na regravação. Por isso o instalador faz um backup datado ao lado do original antes de qualquer alteração.

## Licença

MIT — veja o `LICENSE` na raiz do repositório.
