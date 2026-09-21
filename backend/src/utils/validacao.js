function somenteDigitos(valor) {
    return String(valor == null ? '' : valor).replace(/\D/g, '');
}

function cpfValido(valor) {
    const cpf = somenteDigitos(valor);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

    for (let posicao = 9; posicao < 11; posicao++) {
        let soma = 0;
        for (let i = 0; i < posicao; i++) soma += Number(cpf[i]) * (posicao + 1 - i);
        const digito = ((soma * 10) % 11) % 10;
        if (digito !== Number(cpf[posicao])) return false;
    }
    return true;
}

function emailValido(valor) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(valor || '').trim());
}

/* Confere o que veio do formulário e devolve os dados limpos ou a lista
   de erros por campo, já com a mensagem para mostrar na tela. */
function validarComprador(dados) {
    const erros = {};
    const nome = String(dados.nome || '').trim().replace(/\s+/g, ' ');
    const email = String(dados.email || '').trim().toLowerCase();
    const cpf = somenteDigitos(dados.cpf);
    const telefone = somenteDigitos(dados.telefone);

    if (nome.length < 5 || nome.split(' ').length < 2 || nome.length > 120) {
        erros.nome = 'Informe o nome completo.';
    }
    if (!emailValido(email) || email.length > 160) erros.email = 'Informe um e-mail válido.';
    if (!cpfValido(cpf)) erros.cpf = 'CPF inválido.';
    if (telefone && (telefone.length < 10 || telefone.length > 11)) {
        erros.telefone = 'Informe o WhatsApp com DDD.';
    }

    return {
        ok: Object.keys(erros).length === 0,
        erros,
        dados: { nome, email, cpf, telefone }
    };
}

function mascararEmail(email) {
    const [usuario, dominio] = String(email).split('@');
    if (!dominio) return '';
    const visivel = usuario.slice(0, Math.min(2, usuario.length));
    return visivel + '***@' + dominio;
}

module.exports = { cpfValido, validarComprador, mascararEmail };
