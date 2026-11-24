const SCRIPT_URL = 'ВСТАВЬТЕ_ВАШ_URL_СЮДА';
const QUESTIONS_COUNT = 10;
const TIME_LIMIT = 45;
const SHUFFLE_QUESTIONS = true;
const SHUFFLE_OPTIONS = true;
const BLOCK_RETAKE = true;

const STORAGE_KEY = 'quiz_active_session_v1';
const COMPLETED_KEY = 'quiz_completed_result_v1';

let rawQuestions = [];
let questions = [];
let currentQuestion = 0;
let score = 0;
let selectedOption = null;
let answerChecked = false;
let userData = {};
let userAnswersLog = [];
let isQuizActive = false;
let timerInterval = null;
let questionEndTime = null;

const startScreen = document.getElementById('start-screen');
const quizScreen = document.getElementById('quiz-screen');
const resultScreen = document.getElementById('result-screen');
const optionsContainer = document.getElementById('options-container');
const nextBtn = document.getElementById('next-btn');
const startBtn = document.querySelector('#user-form button[type="submit"]');
const timerDisplay = document.getElementById('timer-display');

window.addEventListener('beforeunload', function (e) {
  if (isQuizActive) {
    e.preventDefault();
    e.returnValue = '';
  }
});

function saveSessionState() {
  if (!isQuizActive) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    questions, currentQuestion, score, selectedOption,
    answerChecked, userData, userAnswersLog, questionEndTime
  }));
}

function initApp() {
  if (BLOCK_RETAKE) {
    const completedData = localStorage.getItem(COMPLETED_KEY);
    if (completedData) {
      const res = JSON.parse(completedData);
      startScreen.classList.add('hidden');
      resultScreen.classList.remove('hidden');
      document.getElementById('score-text').textContent = `Вы уже прошли этот тест. Ваш результат: ${res.score}`;
      document.getElementById('save-status').textContent = `Участник: ${res.fio} (${res.city})`;
      return;
    }
  }

  const savedSession = localStorage.getItem(STORAGE_KEY);
  if (savedSession) {
    const state = JSON.parse(savedSession);
    questions = state.questions;
    currentQuestion = state.currentQuestion;
    score = state.score;
    selectedOption = state.selectedOption;
    answerChecked = state.answerChecked;
    userData = state.userData;
    userAnswersLog = state.userAnswersLog;
    questionEndTime = state.questionEndTime;
    isQuizActive = true;
    startScreen.classList.add('hidden');
    quizScreen.classList.remove('hidden');
    document.getElementById('restore-notice').classList.remove('hidden');
    renderQuestion(true);
    return;
  }

  startBtn.disabled = true;
  startBtn.textContent = 'Загрузка вопросов...';

  fetch('questions.json?v=' + Date.now())
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(data => {
      rawQuestions = data;
      startBtn.disabled = false;
      startBtn.textContent = 'Начать тест';
    })
    .catch(() => {
      startBtn.textContent = 'Ошибка загрузки базы вопросов';
      alert('Ошибка: проверьте наличие и синтаксис файла questions.json');
    });
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function prepareQuestions() {
  let pool = SHUFFLE_QUESTIONS ? shuffleArray(rawQuestions) : [...rawQuestions];
  pool = pool.slice(0, Math.min(QUESTIONS_COUNT, pool.length));
  return pool.map(q => {
    const correctText = q.options[q.correct];
    const opts = SHUFFLE_OPTIONS ? shuffleArray(q.options) : [...q.options];
    return { question: q.question, options: opts, correct: opts.indexOf(correctText) };
  });
}

document.getElementById('user-form').addEventListener('submit', function(e) {
  e.preventDefault();
  if (rawQuestions.length === 0) return;
  questions = prepareQuestions();
  currentQuestion = 0;
  score = 0;
  userAnswersLog = [];
  isQuizActive = true;
  userData = {
    fio: document.getElementById('fio').value.trim(),
    city: document.getElementById('city').value.trim(),
    email: document.getElementById('email').value.trim(),
    instantFeedback: document.getElementById('instant-feedback').checked
  };
  startScreen.classList.add('hidden');
  quizScreen.classList.remove('hidden');
  renderQuestion(false);
});

function startTimer(isRestored) {
  clearInterval(timerInterval);
  if (!isRestored || !questionEndTime) {
    questionEndTime = Date.now() + TIME_LIMIT * 1000;
  }
  saveSessionState();

  function tick() {
    const timeLeft = Math.max(0, Math.ceil((questionEndTime - Date.now()) / 1000));
    const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const secs = (timeLeft % 60).toString().padStart(2, '0');
    timerDisplay.textContent = `${mins}:${secs}`;
    timerDisplay.classList.toggle('warning', timeLeft <= 10);

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      handleTimeout();
    }
  }
  tick();
  timerInterval = setInterval(tick, 500);
}

function handleTimeout() {
  if (selectedOption !== null) {
    processAnswerAndNext();
  } else {
    userAnswersLog.push(`${currentQuestion + 1}) [Время вышло] (Ошибка)`);
    currentQuestion++;
    currentQuestion < questions.length ? renderQuestion(false) : finishQuiz();
  }
}

function renderQuestion(isRestored) {
  if (!isRestored) { selectedOption = null; answerChecked = false; }
  nextBtn.disabled = (selectedOption === null);
  nextBtn.textContent = (currentQuestion === questions.length - 1) ? "Завершить тест" : "Далее";

  const q = questions[currentQuestion];
  document.getElementById('progress-text').textContent = `Вопрос ${currentQuestion + 1} из ${questions.length}`;
  document.getElementById('question-text').textContent = q.question;
  optionsContainer.innerHTML = '';

  q.options.forEach((optText, index) => {
    const div = document.createElement('div');
    div.className = 'option';
    div.textContent = optText;
    div.onclick = () => selectOption(index, div);

    if (isRestored && selectedOption === index) {
      if (userData.instantFeedback && answerChecked) {
        div.classList.add(index === q.correct ? 'correct' : 'wrong');
      } else {
        div.classList.add('selected');
      }
    }
    if (isRestored && userData.instantFeedback && answerChecked && index === q.correct) {
      div.classList.add('correct');
    }
    optionsContainer.appendChild(div);
  });

  if (userData.instantFeedback && answerChecked) {
    clearInterval(timerInterval);
    timerDisplay.textContent = '00:00';
  } else {
    startTimer(isRestored);
  }
}

function selectOption(index, element) {
  if (userData.instantFeedback && answerChecked) return;
  selectedOption = index;
  document.querySelectorAll('.option').forEach(opt => opt.classList.remove('selected'));

  if (userData.instantFeedback) {
    clearInterval(timerInterval);
    answerChecked = true;
    const correctIdx = questions[currentQuestion].correct;
    if (index === correctIdx) {
      element.classList.add('correct');
    } else {
      element.classList.add('wrong');
      document.querySelectorAll('.option')[correctIdx].classList.add('correct');
    }
  } else {
    element.classList.add('selected');
  }
  nextBtn.disabled = false;
  saveSessionState();
}

function processAnswerAndNext() {
  clearInterval(timerInterval);
  const q = questions[currentQuestion];
  const isCorrect = (selectedOption === q.correct);
  if (isCorrect) score++;
  userAnswersLog.push(`${currentQuestion + 1}) ${q.options[selectedOption]} (${isCorrect ? 'Верно' : 'Ошибка'})`);
  currentQuestion++;
  currentQuestion < questions.length ? renderQuestion(false) : finishQuiz();
}

nextBtn.addEventListener('click', processAnswerAndNext);

function finishQuiz() {
  clearInterval(timerInterval);
  isQuizActive = false;
  localStorage.removeItem(STORAGE_KEY);
  quizScreen.classList.add('hidden');
  resultScreen.classList.remove('hidden');

  const resultString = `${score} из ${questions.length}`;
  document.getElementById('score-text').textContent = `Ваш результат: ${resultString}`;

  if (BLOCK_RETAKE) {
    localStorage.setItem(COMPLETED_KEY, JSON.stringify({
      fio: userData.fio, city: userData.city, score: resultString
    }));
  }
  if (userData.email) {
    document.getElementById('email-info').textContent = `Копия результатов отправлена на ${userData.email}.`;
  }
  document.getElementById('save-status').textContent = 'Сохранение результатов в базу...';

  if (!SCRIPT_URL.startsWith('http')) {
    document.getElementById('save-status').textContent = 'База данных не подключена (не указан SCRIPT_URL).';
    return;
  }

  fetch(SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: new Date().toLocaleString('ru-RU'),
      fio: userData.fio,
      city: userData.city,
      email: userData.email || 'Не указан',
      mode: userData.instantFeedback ? 'С подсказками' : 'Без подсказок',
      score: resultString,
      details: userAnswersLog.join(' | ')
    })
  })
  .then(() => { document.getElementById('save-status').textContent = 'Результаты успешно сохранены в базу!'; })
  .catch(() => { document.getElementById('save-status').textContent = 'Ошибка при сохранении результатов.'; });
}

initApp();
