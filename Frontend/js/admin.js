document.addEventListener('DOMContentLoaded', () => {
    // Elementos del DOM
    const adminStatus = document.getElementById('adminStatus');
    const addQuestionBtn = document.getElementById('addQuestionBtn');
    const startGameBtn = document.getElementById('startGameBtn');
    
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
    }

    // 5. Añadir nueva pregunta
// Modifica el event listener del botón de añadir pregunta
addQuestionBtn.addEventListener('click', async () => {
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
    correctAnswer: parseInt(document.getElementById('correctOption').value),
    category: document.getElementById('questionCategory').value
  };

  // Validación
  if (!questionData.question || questionData.options.some(opt => !opt)) {
    alert('Por favor complete todos los campos');
    return;
  }

  const imageInput = document.getElementById('questionImage');
  const imageFile = imageInput.files[0];

  try {
    if (imageFile) {
      // Si hay imagen, usar la nueva ruta HTTP
      const formData = new FormData();
      formData.append('questionData', JSON.stringify(questionData));
      formData.append('image', imageFile);

      const response = await fetch('/api/questions-with-image', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        alert('Pregunta con imagen añadida exitosamente');
        resetForm();
      } else {
        alert(result.error || 'Error al añadir pregunta con imagen');
      }
    } else {
      // Si no hay imagen, usar el método existente con socket.io
      socket.emit('addQuestion', questionData, (response) => {
        if (response.success) {
          alert('Pregunta añadida exitosamente');
          resetForm();
        } else {
          alert(response.error || 'Error al añadir pregunta');
        }
      });
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Ocurrió un error al procesar la pregunta');
  }
});

function resetForm() {
  document.getElementById('questionText').value = '';
  document.getElementById('option1').value = '';
  document.getElementById('option2').value = '';
  document.getElementById('option3').value = '';
  document.getElementById('questionImage').value = '';
}

    // 6. Mostrar preguntas al recibir datos iniciales
    socket.on('initData', (data) => {
        renderQuestionsList(data.questions);
    });

    // 7. Función para renderizar preguntas
    function renderQuestionsList(questions) {
        const container = document.getElementById('questionsContainer') || createQuestionsContainer();
        
        if (!questions || questions.length === 0) {
            container.innerHTML = '<p class="no-questions">No hay preguntas cargadas aún.</p>';
            return;
        }

        container.innerHTML = questions.map((question, index) => `
    <div class="question-item">
        <h3>Pregunta ${index + 1}: ${question.question}</h3>
        <p><strong>Categoría:</strong> ${question.category || 'Sin categoría'}</p>
        <ul class="options-list">
            ${question.options.map((option, optIndex) => `
                <li ${optIndex === question.correctAnswer ? 'class="correct-option"' : ''}>
                    ${optIndex + 1}. ${option}
                    ${optIndex === question.correctAnswer ? ' ✅' : ''}
                </li>
            `).join('')}
        </ul>
        <p><small>ID: ${question.id}</small></p>
        <button class="delete-btn" data-id="${question.id}">Eliminar</button>
    </div>
`).join('');

        // Agregar event listeners para eliminar
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const questionId = e.target.dataset.id;
                if (confirm('¿Está seguro de eliminar esta pregunta?')) {
                    socket.emit('deleteQuestion', questionId);
                }
            });
        });
    }

    // 8. Crear contenedor si no existe
    function createQuestionsContainer() {
        const container = document.createElement('div');
        container.id = 'questionsContainer';
        const section = document.createElement('div');
        section.className = 'questions-list';
        section.innerHTML = '<h2>📝 Lista de Preguntas Cargadas</h2>';
        section.appendChild(container);
        document.querySelector('.container').appendChild(section);
        return container;
    }

    // 9. Actualizar lista cuando se elimina pregunta
    socket.on('questionDeleted', () => {
        socket.emit('requestQuestionsUpdate');
    });

    // 10. Iniciar el juego
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

    // 11. Manejar actualizaciones del servidor
    socket.on('questionAdded', () => {
        socket.emit('requestQuestionsUpdate');
    });

    socket.on('gameStarted', () => alert('El juego ha comenzado!'));
    socket.on('error', (errorMsg) => alert(`Error: ${errorMsg}`));

    // 12. Inicialización
    addQuestionBtn.disabled = true;
    startGameBtn.disabled = true;
});