# DOM Runner

Rode JavaScript com **DOM de verdade** direto do seu editor, com a saída caindo no painel de output. Sem abrir navegador, sem abrir aba, sem alternar de janela.

```js
const titulo = document.getElementById('titulo');
console.log(titulo.textContent);
titulo.innerHTML = '<h2>Funciona</h2>';
console.log(titulo.textContent);
```

`Ctrl+Alt+N`:

```
Olá
Funciona
```

---

## O problema que isso resolve

Quem está estudando DOM esbarra sempre na mesma parede: aperta o botão de rodar e recebe `ReferenceError: document is not defined`.

O motivo é que **DOM não faz parte do JavaScript**. `document`, `window`, `getElementById` — nada disso está na linguagem. São APIs que o *navegador* fornece. O Node.js é um runtime de JavaScript sem navegador, então não tem DOM nenhum.

As duas respostas que a internet costuma dar:

- **"Use o navegador"** — resolve, mas te obriga a sair do editor, abrir aba, abrir DevTools. Quem só quer conferir um `console.log` acaba fazendo isso trinta vezes por hora.
- **"Use jsdom"** — o jsdom é uma ferramenta séria, é o ambiente padrão do Jest. Mas ele *implementa* o DOM em vez de rodar o de verdade: não tem layout nem renderização, então `getBoundingClientRect()` devolve zeros e `offsetHeight` é sempre 0. Para quem está *aprendendo*, estudar contra uma réplica com lacunas é risco desnecessário.

O DOM Runner pega o terceiro caminho: roda o **Chromium de verdade**, em modo headless, e joga a saída no console do editor. DOM real, zero janelas.

## Instalação

Cada sistema operacional tem sua própria pasta, **independente das outras**. Entre na sua e siga o README de lá.

| Sistema | Pasta |
|---|---|
| Linux | [`linux/`](linux/) |
| Windows | *em breve* |
| macOS | *em breve* |

Requisito comum: **Node.js**.

> **Usa WSL?** Use a pasta do **Linux**, dentro do WSL. Windows e WSL são sistemas de arquivos diferentes, e um não enxerga o editor instalado no outro.

## O que ele faz

- **Nada abre.** Nem janela, nem aba, nem preview. Só o texto no painel de output.
- **Configuração única.** Instalou, acabou. Arquivo novo, pasta nova, projeto novo — funciona sem tocar em config nenhuma.
- **Sem nome de arquivo obrigatório.** Nada de `index.html` fixo: ele descobre sozinho qual HTML pertence ao seu script.
- **Sem tempo de espera para configurar.** Código assíncrono é detectado: o runner conta as operações pendentes e encerra quando a página fica ociosa.
- **Um arquivo por vez.** Vários `.js` de estudo podem conviver na mesma pasta sem um disparar o outro.
- **Elementos legíveis no log.** `console.log(elemento)` imprime o HTML do elemento, não `JSHandle@node`.
- **Antes e depois preservados.** Logar um elemento e alterá-lo em seguida mostra os dois estados distintos.

## Editores suportados

Qualquer fork do VS Code que aceite a extensão Code Runner: VS Code, VSCodium, Cursor, Windsurf, Trae, Antigravity. O instalador detecta os que estiverem instalados e configura cada um, fazendo backup do `settings.json` antes.

## Licença

MIT — veja [LICENSE](LICENSE).
