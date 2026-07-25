#!/usr/bin/env node
/**
 * patch-settings.js - Linux
 *
 * Insere a configuracao do Code Runner no settings.json de um editor,
 * preservando tudo que ja existe.
 *
 * Uso:
 *   node patch-settings.js <caminho/do/settings.json> <caminho/do/run.js>
 *
 * Sobre as aspas do comando:
 *   O Code Runner monta uma linha de shell substituindo $fullFileName.
 *   Com aspas DUPLAS, um nome de arquivo contendo aspas, $( ) ou crase
 *   escapa da citacao e o restante vira comando executado com o seu
 *   usuario. Com aspas SIMPLES o shell nao interpreta nenhum desses
 *   caracteres; sobra apenas a propria aspa simples como risco, e o
 *   run.js recusa caminhos que a contenham.
 *
 * Sobre o formato do settings.json:
 *   E JSONC - aceita comentarios e virgula sobrando. JSON.parse nao aceita
 *   nenhum dos dois, entao limpamos antes, respeitando strings para nao
 *   confundir o "//" de uma URL com um comentario. Consequencia: os
 *   comentarios do arquivo sao perdidos na regravacao. Por isso o
 *   instalador faz backup datado antes de chamar este script.
 */

'use strict';

const fs = require('fs');

const arquivo = process.argv[2];
const runner = process.argv[3];

if (!arquivo || !runner) {
  console.error('Uso: node patch-settings.js <settings.json> <run.js>');
  process.exit(1);
}

// O caminho do runner entra na linha de comando; se ele proprio contiver
// aspas simples, nao ha citacao segura possivel.
if (runner.indexOf("'") !== -1) {
  console.error('ERRO: o caminho do run.js contem aspa simples.');
  console.error('Mova o projeto para um caminho sem esse caractere.');
  process.exit(1);
}

const COMANDO = "node '" + runner + "' '$fullFileName'";

function limparJsonc(str) {
  let out = '';
  let inStr = false;
  let esc = false;
  let i = 0;

  while (i < str.length) {
    const c = str[i];
    const n = str[i + 1];

    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      i++;
      continue;
    }

    if (c === '"') { inStr = true; out += c; i++; continue; }

    if (c === '/' && n === '/') {
      while (i < str.length && str[i] !== '\n') i++;
      continue;
    }

    if (c === '/' && n === '*') {
      i += 2;
      while (i < str.length && !(str[i] === '*' && str[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    out += c;
    i++;
  }

  return out.replace(/,(\s*[}\]])/g, '$1');
}

function instrucaoManual() {
  console.error('');
  console.error('Cole isto manualmente no seu settings.json:');
  console.error('');
  console.error('  "code-runner.executorMap": {');
  console.error('    "javascript": ' + JSON.stringify(COMANDO));
  console.error('  },');
  console.error('  "code-runner.fileDirectoryAsCwd": true,');
  console.error('  "code-runner.runInTerminal": false,');
  console.error('  "code-runner.clearPreviousOutput": true,');
  console.error('  "code-runner.saveFileBeforeRun": true');
  console.error('');
}

let cfg = {};

if (fs.existsSync(arquivo)) {
  const bruto = fs.readFileSync(arquivo, 'utf8').trim();
  if (bruto) {
    try {
      cfg = JSON.parse(limparJsonc(bruto));
    } catch (e) {
      console.error('Nao consegui interpretar o settings.json existente.');
      console.error('Ele NAO foi alterado.');
      instrucaoManual();
      process.exit(2);
    }
  }
}

const mapa = Object.assign({}, cfg['code-runner.executorMap']);
mapa.javascript = COMANDO;

cfg['code-runner.executorMap'] = mapa;
cfg['code-runner.fileDirectoryAsCwd'] = true;
cfg['code-runner.runInTerminal'] = false;
cfg['code-runner.clearPreviousOutput'] = true;
cfg['code-runner.saveFileBeforeRun'] = true;

fs.writeFileSync(arquivo, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
console.log('settings.json atualizado.');
