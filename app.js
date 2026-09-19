(function () {
  'use strict';

  var PRELOAD_MIN_MS = 1100;
  var PRELOAD_CEILING_MS = 4500;
  var FADE_MS = 550;
  var STORAGE_KEY = 'cs:preloaded';

  var startTime = (window.performance && performance.now) ? performance.now() : Date.now();
  var reduceMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var prefersReducedMotion = !!(reduceMotionQuery && reduceMotionQuery.matches);

  /* ---------- Preloader ---------- */

  function initPreloader() {
    var preloader = document.getElementById('preloader');
    if (!preloader) return;

    var alreadySeen = false;
    try {
      alreadySeen = sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch (e) {
      alreadySeen = false;
    }

    if (alreadySeen) {
      preloader.hidden = true;
      return;
    }

    var done = false;

    function finish() {
      if (done) return;
      done = true;
      preloader.classList.add('is-done');
      try {
        sessionStorage.setItem(STORAGE_KEY, '1');
      } catch (e) {}
      window.setTimeout(function () {
        preloader.hidden = true;
      }, FADE_MS);
    }

    if (prefersReducedMotion) {
      window.setTimeout(finish, 300);
      return;
    }

    window.addEventListener('load', function () {
      var elapsed = (window.performance && performance.now) ? performance.now() - startTime : PRELOAD_MIN_MS;
      var remaining = Math.max(0, PRELOAD_MIN_MS - elapsed);
      window.setTimeout(finish, remaining);
    });

    window.setTimeout(finish, PRELOAD_CEILING_MS);
  }

  /* ---------- Chat demo ---------- */

  var SCRIPT = [
    { who: 'client', text: 'Bonjour, vous avez encore le pagne wax indigo ?' },
    { who: 'agent', typingMs: 1100, text: 'Bonjour ! Oui, le pagne wax indigo (6 yards) est disponible à 15 000 FCFA la pièce, 13 500 FCFA/pièce à partir de 2 pièces.' },
    { who: 'client', text: 'Je peux en avoir 2 alors ?' },
    { who: 'agent', typingMs: 900, text: 'Parfait : 2 pagnes wax indigo à 13 500 FCFA/pièce, soit 27 000 FCFA au total.' },
    { who: 'client', text: 'Vous avez aussi des chaussures assorties ?' },
    { who: 'agent', typingMs: 1300, text: "Nous n'avons pas de chaussures au catalogue pour le moment. En revanche, le foulard wax assorti à 3 000 FCFA irait très bien avec votre pagne." },
    { who: 'client', text: "D'accord, ajoutez un foulard aussi." },
    { who: 'agent', typingMs: 1000, text: 'Ajouté : 1 foulard wax assorti. Total de la commande : 30 000 FCFA. Retrait en boutique ou livraison ?' },
    { who: 'client', text: 'Livraison à Calavi, s\'il vous plaît.' },
    { who: 'agent', typingMs: 1200, text: 'Commande confirmée : 2 pagnes wax indigo + 1 foulard assorti, livraison à Calavi. Merci pour votre confiance !' }
  ];

  var LOOP_PAUSE_MS = 4500;
  var BASE_DELAY_MS = 650;

  function initChatDemo() {
    var chat = document.getElementById('chat');
    if (!chat) return;

    if (prefersReducedMotion) {
      renderStatic(chat);
      return;
    }

    var generation = 0;
    playSequence(chat, generation);
  }

  function renderStatic(chat) {
    chat.innerHTML = '';
    for (var i = 0; i < SCRIPT.length; i++) {
      chat.appendChild(makeBubble(SCRIPT[i]));
    }
  }

  function makeBubble(entry) {
    var bubble = document.createElement('div');
    bubble.className = 'bubble ' + (entry.who === 'agent' ? 'bubble--agent' : 'bubble--client');
    bubble.textContent = entry.text;
    return bubble;
  }

  function makeTypingBubble() {
    var typing = document.createElement('div');
    typing.className = 'bubble bubble--typing';
    typing.setAttribute('aria-hidden', 'true');
    typing.appendChild(document.createElement('span'));
    typing.appendChild(document.createElement('span'));
    typing.appendChild(document.createElement('span'));
    return typing;
  }

  function scrollToBottom(chat) {
    chat.scrollTop = chat.scrollHeight;
  }

  function playSequence(chat, myGeneration) {
    chat.innerHTML = '';
    var index = 0;

    function step() {
      if (myGeneration !== currentGeneration) return;

      if (index >= SCRIPT.length) {
        window.setTimeout(function () {
          if (myGeneration !== currentGeneration) return;
          currentGeneration++;
          playSequence(chat, currentGeneration);
        }, LOOP_PAUSE_MS);
        return;
      }

      var entry = SCRIPT[index];
      index++;

      if (entry.who === 'client') {
        chat.appendChild(makeBubble(entry));
        scrollToBottom(chat);
        window.setTimeout(step, BASE_DELAY_MS);
        return;
      }

      var typing = makeTypingBubble();
      chat.appendChild(typing);
      scrollToBottom(chat);

      window.setTimeout(function () {
        if (myGeneration !== currentGeneration) return;
        if (typing.parentNode) typing.parentNode.removeChild(typing);
        chat.appendChild(makeBubble(entry));
        scrollToBottom(chat);
        window.setTimeout(step, BASE_DELAY_MS);
      }, entry.typingMs || 900);
    }

    step();
  }

  var currentGeneration = 0;

  /* ---------- Boot ---------- */

  initPreloader();
  initChatDemo();
})();
