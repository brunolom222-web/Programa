document.addEventListener('DOMContentLoaded', () => {
    // Elementos del DOM
    const adminStatus = document.getElementById('adminStatus');
    const addQuestionBtn = document.getElementById('addQuestionBtn');
    const startGameBtn = document.getElementById('startGameBtn');
    const questionList = document.getElementById('questionsList');
    
    // Conexión Socket.IO
    const socket = io();
    let isAdmin = false;

    // 1. Manejar conexión inicial
    socket.on('connect', () => {
        console.log('Conectado al servidor con ID:', socket.id);
        adminStatus.textContent = "Autenticando...";
        adminStatus.style.color = "orange";
        
        // Enviar identificación como admin
        socket.emit('iamadmin');
    });

    // 2. Confirmación de admin exitosa
    socket.on('adminConfirmed', () => {
        isAdmin = true;
        adminStatus.textContent = "Modo Admin: ACTIVADO";
        adminStatus.style.color = "green";
        enableAdminControls();
        console.log('Autenticación como admin exitosa');
    });

    // 3. Manejar error de autenticación
    socket.on('adminError', (errorMsg) => {
        adminStatus.textContent = `Error: ${errorMsg}`;
        adminStatus.style.color = "red";
        console.error('Error en autenticación admin:', errorMsg);
    });

    // 4. Habilitar controles admin
    function enableAdminControls() {
        addQuestionBtn.disabled = false;
        startGameBtn.disabled = false;
        updateQuestionList();
    }

    // 5. Añadir nueva pregunta
    addQuestionBtn.addEventListener('click', () => {
        if (!isAdmin) {
            alert('Error: No tiene permisos de administrador');
            return;
        }

        const questionData = {
            question: document.getElementById('questionText').value.trim(),
            options: [
                document.getElementById('option1').value.trim(),
                document.getElementById('option2').value.trim(),
                document.getElementById('option3').value.trim()
            ],
            correctAnswer: parseInt(document.getElementById('correctOption').value)
        };

        // Validación
        if (!questionData.question || questionData.options.some(opt => !opt)) {
            alert('Por favor complete todos los campos');
            return;
        }

        socket.emit('addQuestion', questionData, (response) => {
            if (response.success) {
                alert('Pregunta añadida exitosamente');
                document.getElementById('questionForm').reset();
            } else {
                alert(response.error || 'Error al añadir pregunta');
            }
        });
    });

    // 6. Iniciar el juego
    startGameBtn.addEventListener('click', () => {
        if (!isAdmin) {
            alert('Error: No tiene permisos de administrador');
            return;
        }

        if (!confirm('¿Está seguro que desea iniciar el concurso?')) return;
        
        socket.emit('startGame', (response) => {
            if (response.success) {
                alert('Concurso iniciado exitosamente');
            } else {
                alert(response.error || 'Error al iniciar el concurso');
            }
        });
    });

    // 7. Actualizar lista de preguntas
    function updateQuestionList() {
        socket.emit('getQuestions', null, (questions) => {
            questionList.innerHTML = '';
            questions.forEach((q, index) => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <strong>Pregunta ${index + 1}:</strong> ${q.question}
                    <br>Opciones: ${q.options.join(', ')}
                    <br>Respuesta correcta: Opción ${q.correctAnswer + 1}
                `;
                questionList.appendChild(li);
            });
        });
    }

    // 8. Manejar actualizaciones del servidor
    socket.on('questionAdded', updateQuestionList);
    socket.on('gameStarted', () => alert('El juego ha comenzado!'));
    socket.on('error', (errorMsg) => alert(`Error: ${errorMsg}`));

    // 9. Inicialización
    addQuestionBtn.disabled = true;
    startGameBtn.disabled = true;
});