// script.js
let currentSection = '';
let currentQuestions = [];   // प्रीलोडेड क्वेश्चन का पूल
let usedQuestions = [];      // AI जेनरेशन के लिए यूज़ किए गए हिंदी/एक्टिव वाक्य
let currentQuestion = null;
let score = 0;
let allSectionsQuestions = {}; // सभी सेक्शन के क्वेश्चन डेटा का कैश

// पेज लोड होते ही सभी JSON क्वेश्चन फ़ाइलें प्रीलोड कर लें
async function preload() {
  const files = ['present', 'past', 'future', 'active-passive'];
  for (let f of files) {
    try {
      const resp = await fetch(`/questions/${f}.json`);
      allSectionsQuestions[f] = await resp.json();
    } catch (e) {
      allSectionsQuestions[f] = [];
    }
  }
}
preload();

// ऐरे को शफ़ल करने का फंक्शन
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// सेक्शन शुरू करें (मेनू बटन से कॉल होता है)
async function startSection(section) {
  currentSection = section;
  score = 0;
  usedQuestions = [];
  document.getElementById('score').innerText = score;
  document.getElementById('menu').style.display = 'none';
  document.getElementById('game-area').style.display = 'block';

  // सेक्शन के अनुसार क्वेश्चन पूल तैयार करें
  if (section === 'mix') {
    const pres = allSectionsQuestions['present'] || [];
    const past = allSectionsQuestions['past'] || [];
    const fut = allSectionsQuestions['future'] || [];
    currentQuestions = [...pres, ...past, ...fut];
  } else if (section === 'active-passive') {
    currentQuestions = [...(allSectionsQuestions['active-passive'] || [])];
  } else {
    currentQuestions = [...(allSectionsQuestions[section] || [])];
  }
  shuffleArray(currentQuestions);
  nextQuestion();
}

// मेनू पर वापस जाएँ
function goBack() {
  document.getElementById('game-area').style.display = 'none';
  document.getElementById('menu').style.display = ''; // grid या flex पर रीसेट
  currentQuestions = [];
}

// अगला प्रश्न दिखाएँ
async function nextQuestion() {
  if (currentQuestions.length === 0) {
    // सारे प्रीलोडेड ख़त्म, AI से नया क्वेश्चन बनवाओ
    document.getElementById('feedback').innerText = 'Generating new question...';
    document.getElementById('submit-btn').disabled = true;
    await generateAIQuestion();
    document.getElementById('submit-btn').disabled = false;
    return;
  }
  currentQuestion = currentQuestions.pop();
  // AI जेनरेशन के लिए यूज़ किए गए वाक्यों की लिस्ट में डालें
  if (currentSection === 'active-passive') {
    usedQuestions.push(currentQuestion.active);
  } else {
    usedQuestions.push(currentQuestion.hindi);
  }
  displayQuestion();
}

// प्रश्न को स्क्रीन पर दिखाएँ
function displayQuestion() {
  const qText = document.getElementById('question-text');
  if (currentSection === 'active-passive') {
    qText.innerHTML = `Change to Passive Voice:<br><b>${currentQuestion.active}</b>`;
  } else {
    qText.innerHTML = `Translate to English:<br><b>${currentQuestion.hindi}</b>`;
  }
  document.getElementById('user-input').value = '';
  document.getElementById('feedback').innerText = '';
  document.getElementById('alternatives').innerText = '';
}

// "Check" बटन का इवेंट लिस्नर
document.getElementById('submit-btn').addEventListener('click', async () => {
  const userAnswer = document.getElementById('user-input').value.trim();
  if (!userAnswer) return;

  let action, payload;
  if (currentSection === 'active-passive') {
    action = 'validate_passive';
    payload = { active: currentQuestion.active, userPassive: userAnswer };
  } else {
    action = 'validate_translation';
    payload = {
      hindi: currentQuestion.hindi,
      userEnglish: userAnswer,
      tense: currentSection === 'mix' ? 'all' : currentSection
    };
  }

  document.getElementById('submit-btn').disabled = true;
  try {
    const response = await fetch('/api/ask-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });
    const result = await response.json();

    if (result.status === 'CORRECT') {
      score++;
      document.getElementById('score').innerText = score;
      document.getElementById('feedback').innerHTML = '✅ Correct! ' + (result.message || '');
      if (result.alternatives && result.alternatives.length) {
        document.getElementById('alternatives').innerText = 'Other ways: ' + result.alternatives.join(', ');
      }
      setTimeout(() => {
        document.getElementById('submit-btn').disabled = false;
        nextQuestion();
      }, 1500);
    } else {
      document.getElementById('feedback').innerHTML = '❌ Incorrect. ' + (result.message || '');
      const correct = result.correct_translation || result.correct_passive || '';
      if (correct) {
        document.getElementById('alternatives').innerText = 'Correct: ' + correct;
      }
      document.getElementById('submit-btn').disabled = false;
    }
  } catch (err) {
    document.getElementById('feedback').innerText = 'Error checking answer. Try again.';
    document.getElementById('submit-btn').disabled = false;
  }
});

// AI (Groq) से नया क्वेश्चन जेनरेट करें
async function generateAIQuestion() {
  let action, payload;
  if (currentSection === 'active-passive') {
    action = 'generate_passive_question';
    payload = { usedActives: usedQuestions };
  } else {
    action = 'generate_question';
    const tense = currentSection === 'mix' ? 'all' : currentSection;
    payload = { tense, usedHindiSentences: usedQuestions };
  }

  try {
    const resp = await fetch('/api/ask-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });
    const data = await resp.json();
    if (data.hindi) {
      currentQuestion = { hindi: data.hindi };
    } else if (data.active) {
      currentQuestion = { active: data.active };
    } else {
      throw new Error('No question generated');
    }
    displayQuestion();
  } catch (err) {
    // अगर AI जेनरेशन फेल हो जाए, तो पूल को रीसेट करके दोबारा शुरू करें
    document.getElementById('feedback').innerText = 'AI generation failed. Restarting predefined pool.';
    if (currentSection === 'mix') {
      const pres = allSectionsQuestions['present'] || [];
      const past = allSectionsQuestions['past'] || [];
      const fut = allSectionsQuestions['future'] || [];
      currentQuestions = [...pres, ...past, ...fut];
    } else if (currentSection === 'active-passive') {
      currentQuestions = [...(allSectionsQuestions['active-passive'] || [])];
    } else {
      currentQuestions = [...(allSectionsQuestions[currentSection] || [])];
    }
    shuffleArray(currentQuestions);
    usedQuestions = [];
    nextQuestion();
  }
}

// एंटर की दबाने पर भी सबमिट हो
document.getElementById('user-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('submit-btn').click();
});
