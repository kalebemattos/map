// appData.js

// Objeto global para armazenar Lideranças e Observações.
// Os dados não serão persistidos após o recarregamento,
// a menos que você copie e cole manualmente o conteúdo atualizado aqui.
const appData = {};

// Função utilitária para garantir que a estrutura da cidade exista
function ensureCityData(city) {
    if (!appData[city]) {
        appData[city] = {
            liderancas: [],
            observacoes: []
        };
    }
}