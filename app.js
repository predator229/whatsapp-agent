(function () {
  'use strict';

  var reduceMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var prefersReducedMotion = !!(reduceMotionQuery && reduceMotionQuery.matches);

  /* ---------- Démo de conversation ---------- */

  var SCRIPT = [
    { who: 'client', time: '09:14', text: 'Bonjour, vous avez encore le pagne wax indigo ?' },
    { who: 'agent', time: '09:14', typingMs: 1100, text: 'Bonjour ! Oui, le pagne wax indigo (6 yards) est disponible à 15 000 FCFA la pièce, 13 500 FCFA/pièce à partir de 2 pièces.' },
    { who: 'client', time: '09:16', text: 'Je peux en avoir 2 alors ?' },
    { who: 'agent', time: '09:16', typingMs: 900, text: 'Parfait : 2 pagnes wax indigo à 13 500 FCFA/pièce, soit 27 000 FCFA au total.' },
    { who: 'client', time: '09:18', text: 'Vous avez aussi des chaussures assorties ?' },
    { who: 'agent', time: '09:19', typingMs: 1300, text: "Nous n'avons pas de chaussures au catalogue pour le moment. En revanche, le foulard wax assorti à 3 000 FCFA irait très bien avec votre pagne." },
    { who: 'client', time: '09:20', text: "D'accord, ajoutez un foulard aussi." },
    { who: 'agent', time: '09:20', typingMs: 1000, text: 'Ajouté : 1 foulard wax assorti. Total de la commande : 30 000 FCFA. Retrait en boutique ou livraison ?' },
    { who: 'client', time: '09:22', text: 'Livraison à Calavi, s\'il vous plaît.' },
    { who: 'agent', time: '09:23', typingMs: 1200, text: 'Commande confirmée : 2 pagnes wax indigo + 1 foulard assorti, livraison à Calavi. Merci pour votre confiance !' }
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

    playSequence(chat, currentGeneration);
  }

  function renderStatic(chat) {
    chat.innerHTML = '';
    for (var i = 0; i < SCRIPT.length; i++) {
      chat.appendChild(makeBubble(SCRIPT[i]));
    }
  }

  function makeTicks() {
    var span = document.createElement('span');
    span.className = 'bubble__ticks';
    span.innerHTML = '<svg viewBox="0 0 16 11" width="14" height="10" fill="none"><path d="M1 5.5L4.5 9L10.5 1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 5.5L9 9L15 1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return span;
  }

  function makeBubble(entry) {
    var bubble = document.createElement('div');
    bubble.className = 'bubble ' + (entry.who === 'agent' ? 'bubble--agent' : 'bubble--client');

    var text = document.createElement('p');
    text.className = 'bubble__text';
    text.textContent = entry.text;
    bubble.appendChild(text);

    var meta = document.createElement('span');
    meta.className = 'bubble__meta';
    meta.setAttribute('aria-hidden', 'true');
    meta.appendChild(document.createTextNode(entry.time));
    if (entry.who === 'agent') {
      meta.appendChild(makeTicks());
    }
    bubble.appendChild(meta);

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

  /* ---------- Démarrage ---------- */

  initChatDemo();
})();
