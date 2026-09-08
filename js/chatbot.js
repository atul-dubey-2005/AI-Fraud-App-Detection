class FraudShieldAiChatbot extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.initEvents();

    // Page load hone ke 1 second baad welcome tooltip/bubble ko animate karke dikhana
    setTimeout(() => {
      const tooltip = this.shadowRoot.getElementById('welcome-tooltip');
      if (tooltip) {
        tooltip.classList.add('show');
      }
    }, 1000);
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          font-family: 'Inter', sans-serif, system-ui;
        }

        /* Logo Attention Animation */
        @keyframes logoAttention {
          0%, 100% {
            transform: scale(1) translateY(0);
            box-shadow: 0 4px 20px rgba(0, 255, 102, 0.4);
          }
          50% {
            transform: scale(1.08) translateY(-4px);
            box-shadow: 0 0 25px rgba(0, 255, 102, 0.7);
          }
        }

        /* Floating Toggle Button */
        .chat-toggle-wrapper {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 9999;
          display: flex;
          align-items: center;
        }

        .chat-toggle-btn {
          width: 56px;
          height: 56px;
          background: #00ff66;
          color: #050507;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 20px rgba(0, 255, 102, 0.4);
          animation: logoAttention 2.5s infinite ease-in-out;
          transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), background 0.2s;
        }

        .chat-toggle-btn:hover {
          transform: scale(1.12);
          background: #00cc52;
          animation: none;
        }

        /* Welcome Tooltip Bubble with Indicator Arrow */
        .welcome-tooltip {
          position: absolute;
          right: 70px;
          bottom: 5px;
          background: #121214;
          border: 1px solid rgba(0, 255, 102, 0.4);
          color: #ffffff;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 0.8rem;
          width: 220px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          opacity: 0;
          transform: translateX(10px) scale(0.95);
          pointer-events: none;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .welcome-tooltip.show {
          opacity: 1;
          transform: translateX(0) scale(1);
          pointer-events: auto;
        }

        .welcome-tooltip .tooltip-title {
          font-weight: 700;
          color: #00ff66;
          margin-bottom: 2px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .welcome-tooltip .close-tip {
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          font-size: 0.9rem;
        }
        .welcome-tooltip .close-tip:hover {
          color: #fff;
        }

        /* Tooltip Arrow pointing to button */
        .welcome-tooltip::after {
          content: '';
          position: absolute;
          right: -6px;
          bottom: 18px;
          width: 0;
          height: 0;
          border-top: 6px solid transparent;
          border-bottom: 6px solid transparent;
          border-left: 6px solid #121214;
        }

        /* Chat Container with Smooth Pop-up Animation */
        .chat-container {
          position: fixed;
          bottom: 90px;
          right: 20px;
          width: 360px;
          max-width: 90vw;
          height: 480px;
          background: #0f0f13;
          border: 1px solid #1c1c24;
          border-radius: 16px;
          box-shadow: 0 15px 40px rgba(0, 0, 0, 0.6);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          z-index: 9999;
          transform: scale(0);
          opacity: 0;
          transform-origin: bottom right;
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
          pointer-events: none;
        }

        .chat-container.open {
          transform: scale(1);
          opacity: 1;
          pointer-events: auto;
        }

        .chat-header {
          background: #0f0f13;
          border-bottom: 1px solid #1c1c24;
          color: #ffffff;
          padding: 14px 16px;
          font-size: 0.95rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .header-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .chat-header .status-dot {
          width: 8px;
          height: 8px;
          background-color: #00ff66;
          border-radius: 50%;
          box-shadow: 0 0 8px rgba(0, 255, 102, 0.6);
        }

        .close-btn {
          background: transparent;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          font-size: 1.2rem;
          padding: 2px 6px;
          border-radius: 6px;
          transition: color 0.2s, background 0.2s;
        }

        .close-btn:hover {
          color: #ffffff;
          background: #1c1c24;
        }

        .chat-messages {
          flex: 1;
          padding: 14px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: #050507;
        }

        .message {
          max-width: 85%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 0.875rem;
          line-height: 1.4;
          word-wrap: break-word;
        }

        .user-message {
          align-self: flex-end;
          background-color: #00ff66;
          color: #000000;
          font-weight: 500;
          border-bottom-right-radius: 2px;
        }

        .bot-message {
          align-self: flex-start;
          background-color: #1c1c24;
          color: #d1d5db;
          border: 1px solid #272732;
          border-bottom-left-radius: 2px;
        }

        .typing-indicator {
          align-self: flex-start;
          font-style: italic;
          color: #9ca3af;
          font-size: 0.75rem;
          display: none;
          padding: 6px 10px;
          background: #1c1c24;
          border-radius: 8px;
        }

        .chat-input-container {
          display: flex;
          padding: 12px;
          background: #0f0f13;
          border-top: 1px solid #1c1c24;
          gap: 8px;
        }

        .chat-input {
          flex: 1;
          background: #050507;
          border: 1px solid #1c1c24;
          color: #ffffff;
          border-radius: 10px;
          padding: 8px 14px;
          outline: none;
          font-size: 0.875rem;
          transition: border-color 0.2s;
        }

        .chat-input:focus {
          border-color: #00ff66;
        }

        .send-btn {
          background: #00ff66;
          color: #050507;
          border: none;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          transition: background 0.2s;
        }

        .send-btn:hover {
          background: #00cc52;
        }
      </style>

      <!-- Floating Bubble Wrapper with Intro Tooltip -->
      <div class="chat-toggle-wrapper">
        <!-- Intro Tooltip Bubble -->
        <div class="welcome-tooltip" id="welcome-tooltip">
          <div class="tooltip-title">
            <span>FraudShield AI 🛡️</span>
            <button class="close-tip" id="close-tip">&times;</button>
          </div>
          <p style="color: #d1d5db; line-height: 1.3;">Hey! Click here to chat with me & analyse your apps.</p>
        </div>

        <button class="chat-toggle-btn" id="toggle-btn" title="AI Chat Assistant">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
          </svg>
        </button>
      </div>

      <!-- Chat Box Window -->
      <div class="chat-container" id="chat-container">
        <div class="chat-header">
          <div class="header-title">
            <div class="status-dot"></div>
            FraudShield AI
          </div>
          <button class="close-btn" id="close-btn">&times;</button>
        </div>
        
        <div class="chat-messages" id="chat-messages">
          <div class="message bot-message">Hey! Main FraudShield AI hoon. Aapki kya madad kar sakta hoon?</div>
          <div class="typing-indicator" id="typing-indicator">FraudShield AI soch raha hai...</div>
        </div>
        
        <div class="chat-input-container">
          <input type="text" id="user-input" class="chat-input" placeholder="Yahan message likhein..." />
          <button class="send-btn" id="send-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
      </div>
    `;
  }

  initEvents() {
    const toggleBtn = this.shadowRoot.getElementById('toggle-btn');
    const closeBtn = this.shadowRoot.getElementById('close-btn');
    const closeTipBtn = this.shadowRoot.getElementById('close-tip');
    const chatContainer = this.shadowRoot.getElementById('chat-container');
    const tooltip = this.shadowRoot.getElementById('welcome-tooltip');
    const input = this.shadowRoot.getElementById('user-input');
    const sendBtn = this.shadowRoot.getElementById('send-btn');

    toggleBtn.addEventListener('click', () => {
      tooltip.classList.remove('show');
      chatContainer.classList.toggle('open');
      if (chatContainer.classList.contains('open')) {
        input.focus();
      }
    });

    closeBtn.addEventListener('click', () => {
      chatContainer.classList.remove('open');
    });

    closeTipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      tooltip.classList.remove('show');
    });

    sendBtn.addEventListener('click', () => this.sendMessage());
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });
  }

  async sendMessage() {
    const input = this.shadowRoot.getElementById('user-input');
    const messageText = input.value.trim();

    if (!messageText) return;

    this.appendMessage(messageText, 'user-message');
    input.value = '';
    this.showTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText }),
      });

      const data = await response.json();
      if (data.reply) {
        this.appendMessage(data.reply, 'bot-message');
      } else {
        this.appendMessage('Koyi response nahi mila.', 'bot-message');
      }
    } catch (error) {
      this.appendMessage('Server se connect nahi ho paya.', 'bot-message');
    } finally {
      this.showTyping(false);
    }
  }

  appendMessage(text, className) {
    const messagesContainer = this.shadowRoot.getElementById('chat-messages');
    const typingIndicator = this.shadowRoot.getElementById('typing-indicator');

    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', className);
    msgDiv.innerText = text;

    messagesContainer.insertBefore(msgDiv, typingIndicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  showTyping(isTyping) {
    const typingIndicator = this.shadowRoot.getElementById('typing-indicator');
    typingIndicator.style.display = isTyping ? 'block' : 'none';
    const messagesContainer = this.shadowRoot.getElementById('chat-messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

customElements.define('fraud-shield-ai', FraudShieldAiChatbot);
