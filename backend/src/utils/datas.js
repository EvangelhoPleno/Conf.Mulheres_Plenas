const FORMATO = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Belem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
});

// "15/09/2026 14:30:00" no horário de Paragominas, como na planilha
function dataHoraBrasil(data) {
    return FORMATO.format(data || new Date()).replace(',', '');
}

module.exports = { dataHoraBrasil };
