"use strict";

const elExpressao = document.getElementById("expressao");
const elResultado = document.getElementById("resultado");
const teclas = document.querySelector(".teclas");

const SIMBOLOS = { "+": "+", "-": "−", "*": "×", "/": "÷" };
const MAX_DIGITOS = 15;

const estado = {
  atual: "0",          // número sendo digitado (com ponto decimal)
  anterior: null,      // primeiro operando
  operador: null,      // operador pendente
  reiniciar: false,    // próximo dígito substitui o visor
};

// ---------- Formatação ----------

function formatar(valor) {
  if (valor === "Erro") return valor;
  const [inteiro, decimal] = valor.split(".");
  const negativo = inteiro.startsWith("-");
  const digitos = negativo ? inteiro.slice(1) : inteiro;
  const comMilhar = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (negativo ? "-" : "") + comMilhar + (decimal !== undefined ? "," + decimal : "");
}

function paraTexto(numero) {
  if (!Number.isFinite(numero)) return "Erro";
  // Corrige imprecisões de ponto flutuante (ex.: 0.1 + 0.2)
  const arredondado = Number.parseFloat(numero.toPrecision(12));
  const texto = String(arredondado);
  return texto.includes("e") ? arredondado.toExponential(6) : texto;
}

function atualizarVisor() {
  const texto = formatar(estado.atual);
  elResultado.textContent = texto;
  elResultado.classList.toggle("longo", texto.length > 10);

  elExpressao.textContent =
    estado.anterior !== null && estado.operador
      ? `${formatar(estado.anterior)} ${SIMBOLOS[estado.operador]}`
      : "";

  document.querySelectorAll("[data-operador]").forEach((botao) => {
    botao.classList.toggle(
      "ativo",
      estado.reiniciar && botao.dataset.operador === estado.operador
    );
  });
}

// ---------- Cálculo ----------

function calcular(a, b, operador) {
  const x = Number(a);
  const y = Number(b);
  switch (operador) {
    case "+": return x + y;
    case "-": return x - y;
    case "*": return x * y;
    case "/": return y === 0 ? NaN : x / y;
    default: return y;
  }
}

// ---------- Ações ----------

function recuperarDeErro() {
  if (estado.atual === "Erro") limpar();
}

function digitarNumero(n) {
  recuperarDeErro();
  if (estado.reiniciar) {
    estado.atual = "0";
    estado.reiniciar = false;
  }
  const digitos = estado.atual.replace(/[-.]/g, "").length;
  if (digitos >= MAX_DIGITOS) return;
  estado.atual = estado.atual === "0" ? n : estado.atual === "-0" ? "-" + n : estado.atual + n;
}

function digitarVirgula() {
  recuperarDeErro();
  if (estado.reiniciar) {
    estado.atual = "0";
    estado.reiniciar = false;
  }
  if (!estado.atual.includes(".")) estado.atual += ".";
}

function escolherOperador(op) {
  recuperarDeErro();
  if (estado.operador && !estado.reiniciar) {
    // Encadeamento: 2 + 3 + → mostra 5
    estado.atual = paraTexto(calcular(estado.anterior, estado.atual, estado.operador));
    if (estado.atual === "Erro") {
      estado.anterior = null;
      estado.operador = null;
      return;
    }
  }
  estado.anterior = estado.atual;
  estado.operador = op;
  estado.reiniciar = true;
}

function igual() {
  if (!estado.operador || estado.anterior === null) return;
  const operando = estado.reiniciar ? estado.anterior : estado.atual;
  const expressao = `${formatar(estado.anterior)} ${SIMBOLOS[estado.operador]} ${formatar(operando)} =`;
  estado.atual = paraTexto(calcular(estado.anterior, operando, estado.operador));
  estado.anterior = null;
  estado.operador = null;
  estado.reiniciar = true;
  atualizarVisor();
  elExpressao.textContent = expressao;
}

function limpar() {
  estado.atual = "0";
  estado.anterior = null;
  estado.operador = null;
  estado.reiniciar = false;
}

function apagar() {
  if (estado.reiniciar || estado.atual === "Erro") {
    estado.atual = "0";
    estado.reiniciar = false;
    return;
  }
  estado.atual = estado.atual.slice(0, -1);
  if (estado.atual === "" || estado.atual === "-") estado.atual = "0";
}

function inverterSinal() {
  recuperarDeErro();
  estado.atual = estado.atual.startsWith("-") ? estado.atual.slice(1) : "-" + estado.atual;
  estado.reiniciar = false;
}

function porcentagem() {
  recuperarDeErro();
  const atual = Number(estado.atual);
  // Com + ou −, 200 + 10% = 220; caso contrário, divide por 100
  const valor =
    estado.anterior !== null && (estado.operador === "+" || estado.operador === "-")
      ? (Number(estado.anterior) * atual) / 100
      : atual / 100;
  estado.atual = paraTexto(valor);
  estado.reiniciar = false;
}

// ---------- Eventos ----------

function executar(botao) {
  const { numero, operador, acao } = botao.dataset;

  if (numero !== undefined) digitarNumero(numero);
  else if (operador) escolherOperador(operador);
  else if (acao === "igual") return igual();
  else if (acao === "virgula") digitarVirgula();
  else if (acao === "limpar") limpar();
  else if (acao === "apagar") apagar();
  else if (acao === "sinal") inverterSinal();
  else if (acao === "porcentagem") porcentagem();

  atualizarVisor();
}

teclas.addEventListener("click", (evento) => {
  const botao = evento.target.closest("button");
  if (botao) executar(botao);
});

const MAPA_TECLADO = {
  Enter: '[data-acao="igual"]',
  "=": '[data-acao="igual"]',
  ",": '[data-acao="virgula"]',
  ".": '[data-acao="virgula"]',
  Backspace: '[data-acao="apagar"]',
  Escape: '[data-acao="limpar"]',
  Delete: '[data-acao="limpar"]',
  "%": '[data-acao="porcentagem"]',
  "+": '[data-operador="+"]',
  "-": '[data-operador="-"]',
  "*": '[data-operador="*"]',
  x: '[data-operador="*"]',
  "/": '[data-operador="/"]',
};

document.addEventListener("keydown", (evento) => {
  const seletor = /^\d$/.test(evento.key)
    ? `[data-numero="${evento.key}"]`
    : MAPA_TECLADO[evento.key];
  if (!seletor) return;

  evento.preventDefault();
  const botao = teclas.querySelector(seletor);
  botao.classList.add("pressionada");
  setTimeout(() => botao.classList.remove("pressionada"), 100);
  executar(botao);
});

atualizarVisor();
