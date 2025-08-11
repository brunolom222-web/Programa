const { exec } = require('child_process');
const express = require('express');
const socketIO = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = require('http').createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }



});

// Configuración
const QUESTIONS_FILE = path.join(__dirname, 'questions.json');
const MAX_PLAYERS = 10;
const QUESTION_TIME = 15; // segundos
const TIME_BONUS = 3; // puntos extra por velocidad

// Datos del juego
let questions = [];
let players = {};
let gameState = {
  isActive: false,
  currentQuestion: 0,
  timer: null,
  timeLeft: QUESTION_TIME
};

const playerProgress = {};

// Cargar preguntas
function loadQuestions() {
  try {
    if (fs.existsSync(QUESTIONS_FILE)) {
      const data = fs.readFileSync(QUESTIONS_FILE, 'utf-8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('❌ Error al cargar preguntas:', error);
    return [];
  }
}

// Guardar preguntas
function saveQuestions() {
  try {
    fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(questions, null, 2));
    console.log('✅ Preguntas guardadas');
  } catch (error) {
    console.error('❌ Error al guardar preguntas:', error);
  }
}

// Middleware
app.use(express.static(path.join(__dirname, 'Frontend')));
app.use('/css', express.static(path.join(__dirname, 'Frontend', 'css')));
app.use('/js', express.static(path.join(__dirname, 'Frontend', 'js')));
app.use('/img', express.static(path.join(__dirname, 'Frontend', 'img')));

// Rutas
app.get('/', (req, res) => {
  res.redirect('/player');
});

app.get('/player', (req, res) => {
  res.sendFile(path.join(__dirname, 'Frontend', 'player.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'Frontend', 'admin.html'));
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Servidor funcionando correctamente',
    players: Object.keys(players).length,
    questions: questions.length
  });
});

// Socket.IO
io.on('connection', (socket) => {
  console.log(`🔌 [${new Date().toLocaleTimeString()}] Cliente conectado: ${socket.id}`);

  // Registrar ADMIN
  socket.on('iamadmin', () => {
    try {
      players[socket.id] = {
        id: socket.id,
        name: `Admin-${socket.id.substr(0, 4)}`,
        isAdmin: true,
        connected: true,
        answers: []
      };

      socket.join('admins');
      console.log(`👑 [${new Date().toLocaleTimeString()}] Admin registrado: ${socket.id}`);
      
      socket.emit('initData', {
        players: Object.values(players),
        questions: questions
      });

      socket.emit('adminConfirmed');

      socket.on('requestQuestionsUpdate', () => {
        socket.emit('initData', {
          players: Object.values(players),
          questions: questions
        });
      });

    } catch (error) {
      console.error('❌ Error registrando admin:', error);
      socket.emit('adminError', error.message);
    }
  });

  socket.on('deleteQuestion', (questionId) => {
    try {
      questions = questions.filter(q => q.id !== questionId);
      saveQuestions();
      io.to('admins').emit('questionDeleted');
      console.log(`🗑️ [${new Date().toLocaleTimeString()}] Pregunta eliminada: ${questionId}`);
    } catch (error) {
      console.error('❌ Error eliminando pregunta:', error);
    }
  });

  // Registrar JUGADOR
  socket.on('registerPlayer', (playerName, callback) => {
    try {
      if (!playerName || playerName.trim().length < 3) {
        throw new Error('El nombre debe tener al menos 3 caracteres');
      }

      if (gameState.isActive) {
        throw new Error('El juego ya comenzó. No puedes unirte ahora');
      }

      if (Object.values(players).some(p => 
        p.name.toLowerCase() === playerName.toLowerCase() && p.connected
      )) {
        throw new Error('Nombre ya en uso');
      }

      if (Object.keys(players).length >= MAX_PLAYERS) {
        throw new Error('Límite de jugadores alcanzado');
      }

      players[socket.id] = {
        id: socket.id,
        name: playerName.trim(),
        score: 0,
        isAdmin: false,
        connected: true,
        hasAnswered: false,
        lastResponseTime: 0,
        answers: []
      };

      console.log(`🎮 [${new Date().toLocaleTimeString()}] Jugador registrado: ${playerName}`);
      
      callback({ 
        success: true,
        player: players[socket.id]
      });
      
      io.emit('playerListUpdate', Object.values(players));

    } catch (error) {
      console.error('❌ Error registrando jugador:', error.message);
      callback({ success: false, error: error.message });
    }
  });

  // Añadir pregunta (admin)
  socket.on('addQuestion', (questionData, callback) => {
    try {
      if (!players[socket.id]?.isAdmin) {
        throw new Error('No tienes permisos de administrador');
      }

      const { question, options, correctAnswer } = questionData;
      
      if (!question?.trim() || !options || options.length !== 3 || isNaN(correctAnswer)) {
        throw new Error('Datos de pregunta incompletos');
      }

      const newQuestion = {
        question: question.trim(),
        options: options.map(opt => opt.trim()),
        correctAnswer: parseInt(correctAnswer),
        id: Date.now().toString()
      };

      questions.push(newQuestion);
      saveQuestions();

      io.to('admins').emit('questionAdded', newQuestion);
      callback({ success: true });
      
      console.log(`📝 [${new Date().toLocaleTimeString()}] Pregunta añadida: "${newQuestion.question}"`);

    } catch (error) {
      console.error('❌ Error al añadir pregunta:', error.message);
      callback({ success: false, error: error.message });
    }
  });

  // Iniciar juego (admin)
socket.on('startGame', (callback) => {
    try {
      if (!players[socket.id]?.isAdmin) {
        throw new Error('No autorizado');
      }

      if (questions.length === 0) {
        throw new Error('No hay preguntas registradas');
      }

      if (Object.values(players).filter(p => !p.isAdmin).length === 0) {
        throw new Error('No hay jugadores registrados');
      }

      gameState = {
        isActive: true,
        currentQuestion: 0,
        timer: null,
        timeLeft: QUESTION_TIME
      };

      Object.keys(players).forEach(playerId => {
        if (!players[playerId].isAdmin) {
          const shuffledQuestions = [...questions].sort(() => Math.random() - 0.5);
          playerProgress[playerId] = {
            currentQuestion: 0,
            timer: null,
            timeLeft: QUESTION_TIME,
            questionOrder: shuffledQuestions.map(q => q.id)
          };
          startPlayerTimer(playerId);
          
          const firstQuestionId = playerProgress[playerId].questionOrder[0];
          const firstQuestion = questions.find(q => q.id === firstQuestionId);
          io.to(playerId).emit('newQuestion', {
            question: firstQuestion,
            category: firstQuestion.category || 'default', // ← Añade categoría
            questionNumber: 1,
            totalQuestions: questions.length,
            timeLeft: QUESTION_TIME
          });
        }
      });

      callback({ success: true });
      console.log(`🚀 [${new Date().toLocaleTimeString()}] Juego iniciado`);

    } catch (error) {
      console.error('❌ Error al iniciar juego:', error.message);
      callback({ success: false, error: error.message });
    }
});

  // Respuesta de jugador
  socket.on('submitAnswer', ({ answerIndex }, callback) => {
    try {
      const player = players[socket.id];
      if (!player || !player.connected) {
        throw new Error('Jugador no registrado o desconectado');
      }

      if (!gameState.isActive) {
        throw new Error('El juego no está activo');
      }

      if (player.isAdmin) {
        throw new Error('Los administradores no pueden jugar');
      }

      if (player.hasAnswered) {
        throw new Error('Ya respondiste esta pregunta');
      }

      const currentQId = playerProgress[socket.id].questionOrder[playerProgress[socket.id].currentQuestion];
      const currentQ = questions.find(q => q.id === currentQId);
      const isCorrect = parseInt(answerIndex) === currentQ.correctAnswer;
      const responseTime = QUESTION_TIME - playerProgress[socket.id].timeLeft;

      player.hasAnswered = true;
      player.lastResponseTime = responseTime;

      player.answers.push({
        questionId: currentQ.id,
        questionText: currentQ.question,
        selectedOption: currentQ.options[answerIndex],
        correctOption: currentQ.options[currentQ.correctAnswer],
        isCorrect: isCorrect,
        responseTime: responseTime
      });

      if (isCorrect) {
        const timeScore = Math.max(1, Math.floor((QUESTION_TIME - responseTime) / (QUESTION_TIME / TIME_BONUS)));
        player.score += 10 + timeScore;
        console.log(`✅ ${player.name} respondió correctamente en ${responseTime}s (+${10 + timeScore}p)`);
      }

      clearInterval(playerProgress[socket.id].timer);
      io.emit('scoreUpdate', Object.values(players));
      
      callback({ 
        success: true,
        isCorrect,
        responseTime,
        correctAnswerIndex: currentQ.correctAnswer
      });

    } catch (error) {
      console.error('❌ Error al procesar respuesta:', error.message);
      callback({ success: false, error: error.message });
    }
  });

  function startPlayerTimer(playerId) {
    clearInterval(playerProgress[playerId].timer);
    playerProgress[playerId].timeLeft = QUESTION_TIME;
    
    playerProgress[playerId].timer = setInterval(() => {
      playerProgress[playerId].timeLeft--;
      io.to(playerId).emit('timeUpdate', playerProgress[playerId].timeLeft);
      
      if (playerProgress[playerId].timeLeft <= 0) {
        clearInterval(playerProgress[playerId].timer);
        players[playerId].hasAnswered = true;
        nextPlayerQuestion(playerId);
      }
    }, 1000);
  }

  function nextPlayerQuestion(playerId) {
    const player = players[playerId];
    if (!player || player.isAdmin) return;

    playerProgress[playerId].currentQuestion++;
    player.hasAnswered = false;
    
    if (playerProgress[playerId].currentQuestion < questions.length) {
      // Obtener siguiente pregunta según el orden aleatorio del jugador
      const nextQuestionId = playerProgress[playerId].questionOrder[playerProgress[playerId].currentQuestion];
      const nextQuestion = questions.find(q => q.id === nextQuestionId);
      
      io.to(playerId).emit('newQuestion', {
  question: nextQuestion,
  category: nextQuestion.category || 'default', // ← Añade categoría
  questionNumber: playerProgress[playerId].currentQuestion + 1,
  totalQuestions: questions.length,
  timeLeft: QUESTION_TIME
});
      startPlayerTimer(playerId);
    } else {
      playerFinished(playerId);
    }
  }

  function playerFinished(playerId) {
    const player = players[playerId];
    if (!player || player.isAdmin) return;

    player.hasFinished = true;
    checkAllPlayersFinished();
  }

  function checkAllPlayersFinished() {
    const activePlayers = Object.values(players).filter(p => !p.isAdmin && !p.hasFinished);
    if (activePlayers.length === 0) {
      endGame();
    }
  }

  socket.on('requestNextQuestion', () => {
    nextPlayerQuestion(socket.id);
  });

  socket.on('disconnect', () => {
    if (players[socket.id]) {
      console.log(`🚪 [${new Date().toLocaleTimeString()}] ${players[socket.id].isAdmin ? 'Admin' : 'Jugador'} desconectado: ${players[socket.id].name}`);
      
      if (players[socket.id].isAdmin) {
        socket.leave('admins');
      }
      
      if (playerProgress[socket.id]?.timer) {
        clearInterval(playerProgress[socket.id].timer);
      }
      delete playerProgress[socket.id];
      
      delete players[socket.id];
      io.emit('playerListUpdate', Object.values(players));
    }
  });
});

function endGame() {
  gameState.isActive = false;

  const activePlayers = Object.values(players)
    .filter(p => !p.isAdmin && p.connected)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.lastResponseTime - b.lastResponseTime;
    });

  const gameResults = {
    winner: activePlayers[0],
    players: activePlayers,
    questions: questions,
    playerAnswers: {},
    totalTimes: {}
  };

  Object.values(players).forEach(player => {
    if (!player.isAdmin) {
      gameResults.playerAnswers[player.id] = player.answers;
      gameResults.totalTimes[player.id] = player.answers.reduce((total, answer) => total + answer.responseTime, 0);
    }
  });

  io.emit('gameEnded', gameResults);
  console.log(`🏆 [${new Date().toLocaleTimeString()}] Juego terminado`);
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  questions = loadQuestions();
  console.log(`
  🚀 Servidor listo en puerto ${PORT}
  ⏰ ${new Date().toLocaleTimeString()}
  📂 ${questions.length} preguntas cargadas
  👥 Máximo ${MAX_PLAYERS} jugadores
  ⏱️ ${QUESTION_TIME}s por pregunta
  🏅 Hasta ${TIME_BONUS} puntos extra por velocidad
  `);
});