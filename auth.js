/* Arquivo: auth.js */

// ATENÇÃO: ESSAS CREDENCIAIS FICAM VISÍVEIS NO CÓDIGO-FONTE DO NAVEGADOR. NÃO USE SENHAS REAIS!
const CREDENCIAIS_VALIDAS = {
    // Você pode adicionar mais usuários se quiser, por exemplo: "user2": "senha2"
    "leo": "36555" 
};

function fazerLogin() {
    const username = prompt("Digite seu nome de usuário:");
    const password = prompt("Digite sua senha:");

    // Verifica se o usuário e a senha correspondem às credenciais válidas
    if (CREDENCIAIS_VALIDAS[username] === password) {
        return true;
    } else {
        alert("Credenciais inválidas. Acesso negado.");
        return false;
    }
}