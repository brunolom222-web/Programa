document.addEventListener('DOMContentLoaded', () => {
    // Elementos del DOM
    const joinScreen = document.getElementById('joinScreen');
    const gameScreen = document.getElementById('gameScreen');
    const playerNameInput = document.getElementById('playerName');
    const joinBtn = document.getElementById('joinBtn');
    const errorMsg = document.getElementById('errorMsg');
    const welcomeMessage = document.getElementById('welcomeMessage');
    const playerScore = document.getElementById('playerScore');
    const timeLeft = document.getElementById('timeLeft');
    
    // Conexión Socket.IO
    const socket = io();
    let playerId = null;
    let currentQuestionIndex = 0; // <--- AÑADIDO para control individual

    // IMAGENES
   const categoryBackgrounds = {
    "geografia": "url('/img/geografia.jpeg')",
    "arte": "url('/img/arte.jpeg')",
    "astronomia": "url('/img/astronomia.jpeg')", // Ejemplo con categoría existente
    "biologia": "url('/img/biologia.jpeg')",
    "tecnologia": "url('/img/tecnologia.jpeg')",
    "matematicas": "url('/img/matematica.jpeg')",
    "deportes": "url('/img/deporte.jpeg')",
    "adivinanza": "url('/img/adivinanza.jpeg')",
    "curiosidades": "url('/img/curiosidades.jpeg')" // Imagen genérica
};

    // 1. Configuración inicial
    gameScreen.style.display = 'none';

    // 2. Manejar unión al juego
    joinBtn.addEventListener('click', () => {
        const playerName = playerNameInput.value.trim();
        errorMsg.textContent = '';
        
        if (!playerName || playerName.length < 3) {
            errorMsg.textContent = 'El nombre debe tener al menos 3 caracteres';
            return;
        }

        joinBtn.disabled = true;
        joinBtn.innerHTML = '<span class="spinner"></span> Conectando...';

        socket.emit('registerPlayer', playerName, (response) => {
            if (response.success) {
                playerId = socket.id;
                joinScreen.style.display = 'none';
                gameScreen.style.display = 'block';
                welcomeMessage.textContent = `¡Bienvenido, ${playerName}!`;
                playerScore.textContent = '0';
                currentQuestionIndex = 0; // <--- AÑADIDO
            } else {
                errorMsg.textContent = response.error || 'Error al unirse al juego';
                joinBtn.disabled = false;
                joinBtn.textContent = 'Unirse al Juego';
            }
        });
    });

    // 3. Manejar eventos del juego
    socket.on('gameStarted', (data) => {
        currentQuestionIndex = 0; // <--- AÑADIDO
        displayQuestion(data.question);
        timeLeft.textContent = data.timeLeft;
    });

    // Modifica el evento newQuestion:
    socket.on('newQuestion', (data) => {
        displayQuestion(data.question);
        timeLeft.textContent = data.timeLeft;
        // Cambia el fondo según la categoría
    });

    socket.on('timeUpdate', (time) => {
        timeLeft.textContent = time;
    });

    socket.on('scoreUpdate', (players) => {
        const currentPlayer = players.find(p => p.id === playerId);
        if (currentPlayer) {
            playerScore.textContent = currentPlayer.score;
        }
    });

    socket.on('gameEnded', (data) => {
        showFinalResults(data);
    });

    // 4. Mostrar pregunta y opciones (MODIFICADO)
function displayQuestion(questionData) {
    const gameContainer = document.getElementById('gameScreen');
    const questionContainer = document.getElementById('questionContainer');
    const optionsContainer = document.getElementById('optionsContainer');

    // Aplicar fondo al contenedor principal del juego
    gameContainer.style.backgroundImage = categoryBackgrounds[questionData.category] || "url('/img/default.jpeg')";
    gameContainer.style.backgroundSize = "cover";
    gameContainer.style.backgroundPosition = "center";
    gameContainer.style.backgroundRepeat = "no-repeat";
    gameContainer.style.padding = "25px";
    gameContainer.style.borderRadius = "15px";
    gameContainer.style.boxShadow = "0 4px 15px rgba(0, 0, 0, 0.3)";
    gameContainer.style.position = "relative";

    // Capa para mejorar legibilidad (opcional)
    gameContainer.style.setProperty('--before-opacity', '0.6'); // Control fácil de opacidad
    
    // Contenido de la pregunta (manteniendo legibilidad)
    questionContainer.style.backgroundColor = "rgba(255, 255, 255, 0.68)";
    questionContainer.style.padding = "30px";
    questionContainer.style.borderRadius = "10px";
    questionContainer.style.color = "rgba(0, 0, 0, 1) ";
    questionContainer.style.textAlign = "center";
    questionContainer.style.textShadow = "1px 1px 3px rgba(0, 0, 0, 0)";
    questionContainer.style.marginBottom = "20px";
    questionContainer.innerHTML = `<h3 style="margin: 0;">${questionData.question}</h3>`;

    // Opciones de respuesta
    optionsContainer.innerHTML = '';
    questionData.options.forEach((option, index) => {
        const button = document.createElement('button');
        button.className = 'answer-btn';
        button.textContent = option;
        button.style.display = "block";
        button.style.width = "100%";
        button.style.marginBottom = "12px";
        button.style.padding = "12px";
        button.style.backgroundColor = "rgba(255, 255, 255, 0.9)";
        button.style.border = "none";
        button.style.borderRadius = "8px";
        button.style.cursor = "pointer";
        button.style.transition = "all 0.3s";
        button.style.fontSize = "16px";
        button.style.textAlign = "left";

        button.addEventListener('click', () => {
            // Deshabilitar todos los botones
            const allButtons = optionsContainer.querySelectorAll('button');
            allButtons.forEach(btn => {
                btn.disabled = true;
                btn.style.opacity = '0.7';
            });
            
            // Resaltar selección
            button.style.border = '3px solid #FFD700';
            button.style.fontWeight = 'bold';
            
            socket.emit('submitAnswer', { answerIndex: index }, (response) => {
                if (response.success) {
                    // Feedback visual
                    if (response.isCorrect) {
                        button.style.backgroundColor = '#4CAF50';
                        button.style.color = 'white';
                        button.innerHTML = `✓ ${option}`;
                    } else {
                        button.style.backgroundColor = '#f44336';
                        button.style.color = 'white';
                        button.innerHTML = `✗ ${option}`;
                        
                        // Mostrar respuesta correcta
                        const correctBtn = optionsContainer.children[response.correctAnswerIndex];
                        correctBtn.style.backgroundColor = '#4CAF50';
                        correctBtn.style.color = 'white';
                        correctBtn.innerHTML = `✓ ${correctBtn.textContent}`;
                    }

                    // Avanzar después de 1.5 segundos
                    setTimeout(() => {
                        socket.emit('requestNextQuestion');
                    }, 1500);
                } else {
                    alert(response.error || 'Error al enviar respuesta');
                    button.disabled = false;
                    button.style.opacity = '1';
                }
            });
        });
        
        optionsContainer.appendChild(button);
    });
}

    // 5. Mostrar resultados finales (ya estaba correcto)
   function showFinalResults(data) {
    const questionContainer = document.getElementById('questionContainer');
    const optionsContainer = document.getElementById('optionsContainer');
    
    questionContainer.innerHTML = '';
    optionsContainer.innerHTML = '';

    // Calcular tiempos (MODIFICADO)
    const playerAnswers = data.playerAnswers[playerId] || [];
    const playerTotalTime = playerAnswers.reduce((sum, answer) => sum + answer.responseTime, 0);
    const winnerTotalTime = data.winner ? 
        (data.playerAnswers[data.winner.id] || []).reduce((sum, answer) => sum + answer.responseTime, 0) : 
        0;

    let resultsHTML = `
        <div class="results-container">
            <div class="winner-section">
                <h2>🏆 ${data.winner?.id === playerId ? '¡Ganaste!' : 'Ganador: ' + data.winner?.name}</h2>
                ${data.winner ? `
                    <p>Puntaje: ${data.winner.score} puntos</p>
                    <p>Tiempo del ganador: ${winnerTotalTime}s</p>
                ` : ''}
            </div>
            
            <div class="ranking-section">
                <h3>Ranking Final:</h3>
                <ol>
                    ${data.players.map((player, index) => `
                        <li class="${player.id === playerId ? 'my-position' : ''}">
                            <span class="position">${index + 1}.</span>
                            <span class="name">${player.name}</span>
                            <span class="score">${player.score} pts</span>
                        </li>`).join('')}
                </ol>
            </div>
            
            <div class="answers-history">
                <h3>Tu desempeño:</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Pregunta</th>
                            <th>Tu respuesta</th>
                            <th>Respuesta correcta</th>
                            <th>Resultado</th>
                            <th>Tiempo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${playerAnswers.map(answer => `
                            <tr>
                                <td>${answer.questionText}</td>
                                <td>${answer.selectedOption}</td>
                                <td>${answer.correctOption}</td>
                                <td class="${answer.isCorrect ? 'correct' : 'incorrect'}">
                                    ${answer.isCorrect ? '✅ Correcta' : '❌ Incorrecta'}
                                </td>
                                <td>${answer.responseTime}s</td>
                            </tr>`).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="4" style="text-align: right;"><strong>Tiempo total:</strong></td>
                            <td><strong>${playerTotalTime}s</strong></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
    
    questionContainer.innerHTML = resultsHTML;
}

    // 6. Manejar reconexión
    socket.on('connect', () => {
        if (playerId && gameScreen.style.display === 'block') {
            socket.emit('reconnectPlayer', playerId, (response) => {
                if (!response.success) {
                    alert('Se perdió la conexión. Recargando...');
                    location.reload();
                }
            });
        }
    });

    // 7. Manejar errores de conexión
    socket.on('connect_error', (error) => {
        console.error('Error de conexión:', error);
        alert('Error de conexión con el servidor. Recargando...');
        location.reload();
    });
});