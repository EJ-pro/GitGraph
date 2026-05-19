import React, { useState, useEffect } from 'react';
import { authService } from '../api';
import axios from 'axios';
import PropTypes from 'prop-types';

class ChatComponent extends React.Component {
  constructor(props) {
    super(props);
    this.state = { messages: [] };
  }

  render() {
    return <div>{this.state.messages}</div>;
  }
}

export default function Chat({ roomId }) {
  const [msg, setMsg] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    axios.get(`/api/chat/${roomId}`).then(res => setHistory(res.data));
  }, [roomId]);

  const sendMessage = () => {
    authService.send(roomId, msg);
    setMsg('');
  };

  return (
    <div>
      <ul>{history.map(m => <li key={m.id}>{m.text}</li>)}</ul>
      <input value={msg} onChange={e => setMsg(e.target.value)} />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
}

Chat.propTypes = { roomId: PropTypes.string.isRequired };
