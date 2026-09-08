class FraudShieldAiChatbot extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.initEvents();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }

        .chat-container {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 360px;
          max-width: 90vw;
          height: 500px;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          z-index: 9999;
        }

        .chat-header {
          background: #4f46e5;
          color: #ffffff;
          padding: 14px;
          font-size: 1rem;
          font-weight: 600;
          text-align: center;
        }

        .chat-messages {
          flex: 1;
          padding: 14px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
          background: #fafafa;
        }

        .message {
          max-width: 80%;
          padding: 10px 14px;
          border-radius: 16px;
          font-size: 0.9rem;
          line-height: 1.4;
          word-wrap: break-word;
        }

        .user-message {
          align-self: flex-end;
          background-color: #4f46e5;
          color: #ffffff;
          border-bottom-right-radius: 4px;
        }

        .bot-message {
          align-self: flex-start;
          background-color: #e5e7eb;
          color: #1f2937;
          border-bottom-left-radius: 4px;
        }

        .typing-indicator {
          align-self: flex-start;
          font-style: italic;
          color: #6b7280;
          font-size: 0.8rem;
          display: none;
        }

        .chat-input-container {
          display: flex;
          padding: 10px;
          background: #ffffff;
          border-top: 1px solid #e5e7eb;
        }

        .chat-input {
          flex: 1;
          border: 1px solid #d1d5db;
          border-radius: 20px;
          padding: 8px 14px;
          outline: none;
          font-size: 0.9rem;
        }

        .chat-input:focus {
          border-color: #4f46e5;
        }

        .send-btn {
          background: #4f46e5;
          color: white;
          border: none;
          padding: 8px 14px;
          margin-left: 8px;
          border-radius: 50%;
          cursor: pointer;
          font-weight: bold;
        }
      </style>

      <div class="chat-container">
        <!-- Header Name Updated -->
        <div class="chat-header">FraudShieldAi Chatbot</div>
        
        <div class="chat-messages" id="chat-messages">
          <!-- Welcome Message Updated -->
          <div class="message bot-message">Hello! Main FraudShieldAi Assistant hoon. Main aapki kya madad kar sakta hoon?</div>
          <div class="typing-indicator" id="typing-indicator">FraudShieldAi soch raha hai...</div>
        </div>
        
        <div class="chat-input-container">
          <input type="text" id="user-input" class="chat-input" placeholder="Message likhein..." />
          <button class="send-btn" id="send-btn">&#10148;</button>
        </div>
      </div>
    `;
  }

  initEvents() {
    const input = this.shadowRoot.getElementById('user-input');
    const sendBtn = this.shadowRoot.getElementById('send-btn');

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
      const response = await fetch('api/chat', {
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

// Custom Tag Defined with Updated Name
customElements.define('fraud-shield-ai', FraudShieldAiChatbot);