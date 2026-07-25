// Abra este arquivo no editor e tecle Ctrl+Alt+N.

const titulo = document.getElementById('titulo');

console.log('--- estado inicial ---');
console.log(titulo);

// innerText trata a string como TEXTO: as tags aparecem escapadas.
titulo.innerText = '<em>texto literal</em>';
console.log('innerText: ', titulo);

// innerHTML interpreta a string como HTML de verdade.
titulo.innerHTML = '<em>HTML de verdade</em>';
console.log('innerHTML: ', titulo);

// textContent devolve o texto sem se importar com renderizacao.
console.log('textContent:', titulo.textContent);

console.log('--- percorrendo a lista ---');
const itens = document.querySelectorAll('#lista li');
console.log('quantidade:', itens.length);
itens.forEach((li, i) => console.log(i, li));

console.log('--- criando um elemento ---');
const novo = document.createElement('li');
novo.textContent = 'terceiro';
document.getElementById('lista').appendChild(novo);
console.log(document.getElementById('lista'));

console.log('--- assincrono: o runner espera sozinho ---');
setTimeout(() => {
  const aviso = document.createElement('p');
  aviso.textContent = 'apareci 1,5s depois, sem configurar nada';
  document.body.appendChild(aviso);
  console.log(aviso);
}, 1500);

let contador = 0;
const tique = setInterval(() => {
  contador++;
  console.log('tique', contador);
  if (contador === 3) clearInterval(tique);
}, 400);
