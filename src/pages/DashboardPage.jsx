import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './DashboardPage.css';

const API_BASE = 'http://localhost:4000/api';
const WS_URL = 'ws://localhost:4000/ws/traffic';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    const socket = new WebSocket(WS_URL);

    socket.addEventListener('open', () => {
      setError('');
    });

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'initial') {
          setLogs(message.logs || []);
        } else if (message.type === 'traffic') {
          setLogs((currentLogs) => [message.log, ...currentLogs].slice(0, 100));
        }
      } catch (err) {
        console.error('Invalid websocket payload', err);
      }
    });

    socket.addEventListener('error', () => {
      setError('WebSocket connection failed.');
    });

    socket.addEventListener('close', () => {
      setError('Live traffic feed disconnected.');
    });

    fetchDashboard();

    return () => {
      socket.close();
    };
  }, [navigate, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const summary = useMemo(() => {
    const highestRisk = logs.reduce((max, item) => (item.risk_score > max ? item.risk_score : max), 0);
    const categories = logs.reduce((acc, item) => {
      acc[item.intent_category] = (acc[item.intent_category] || 0) + 1;
      return acc;
    }, {});
    return { count: logs.length, highest_risk: highestRisk, categories };
  }, [logs]);

  const fetchDashboard = async () => {
    const response = await fetch(`${API_BASE}/protected/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      navigate('/login');
    }
  };

  const handleLogout = async () => {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const submitQuestion = async (event) => {
    event.preventDefault();
    if (!question.trim()) return;

    setError('');
    setIsSubmitting(true);

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question.trim()
    };
    setMessages((current) => [...current, userMessage]);
    setQuestion('');

    try {
      const response = await fetch(`${API_BASE}/protected/security-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ question: userMessage.content })
      });
      const result = await response.json();

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.ok ? result.answer : result.error || 'Chat failed.'
      };

      setMessages((current) => [...current, assistantMessage]);
      if (!response.ok) {
        setError(result.error || 'Chat failed.');
      }
    } catch (err) {
      setError('Unable to connect to security chat.');
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: 'Unable to connect to the chat service.'
        }
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1>Security Dashboard</h1>
          <p>Live threat feed and AI security chat.</p>
        </div>
        <button className="logout-button" onClick={handleLogout}>
          Logout
        </button>
      </header>

      <div className="dashboard-grid">
        <section className="dashboard-left">
          <section className="dashboard-summary">
            <div className="summary-card">
              <h2>Recent Logs</h2>
              <p>{summary.count} entries</p>
            </div>
            <div className="summary-card">
              <h2>Highest Risk</h2>
              <p>{summary.highest_risk.toFixed(2)}</p>
            </div>
          </section>

          <section className="live-feed">
            <h2>Live Traffic Feed</h2>
            {error && <div className="error-message">{error}</div>}
            <div className="feed-list">
              {logs.map((log) => (
                <article key={log.id} className={`feed-item risk-${getRiskLevel(log.risk_score)}`}>
                  <div className="feed-header">
                    <span>{new Date(log.time).toLocaleTimeString()}</span>
                    <span>{log.intent_category}</span>
                  </div>
                  <div className="feed-body">
                    <strong>{log.method}</strong> {log.path}
                  </div>
                  <div className="feed-footer">Risk: {log.risk_score.toFixed(2)}</div>
                </article>
              ))}
            </div>
          </section>
        </section>

        <aside className="dashboard-right">
          <section className="chat-panel">
            <h2>AI Security Chat</h2>
            <div className="chat-messages">
              {messages.map((message) => (
                <div key={message.id} className={`chat-message ${message.role}`}>
                  <div className="chat-bubble">
                    <p>{message.content}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={submitQuestion} className="chat-form">
              <input
                type="text"
                placeholder="Ask about recent threat logs..."
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
              <button type="submit" disabled={isSubmitting || !question.trim()}>
                {isSubmitting ? 'Sending…' : 'Ask'}
              </button>
            </form>
          </section>
        </aside>
      </div>
    </main>
  );
}

function getRiskLevel(score) {
  if (score >= 0.8) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}
