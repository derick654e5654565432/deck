import { useEffect, useRef, useState } from 'react';

// Uses the browser's built-in speech recognition (Web Speech API). No server,
// no API key, no external service. Transcribes a spoken phrase into a new
// project card. Works in Chrome (desktop + Android) and Safari (Mac + iOS).
const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export default function VoiceCapture({ onCreate, onClose }) {
  const [phase, setPhase] = useState('record'); // record | review | error
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  const [busy, setBusy] = useState(false);

  const recogRef = useRef(null);
  const finalRef = useRef('');
  const interimRef = useRef('');
  const stoppedByUserRef = useRef(false);
  const startedRef = useRef(false);

  function startRecognition() {
    finalRef.current = '';
    interimRef.current = '';
    stoppedByUserRef.current = false;
    setText('');

    const r = new SR();
    recogRef.current = r;
    r.lang = 'en-GB';
    r.continuous = true;
    r.interimResults = true;

    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalRef.current += res[0].transcript;
        else interim += res[0].transcript;
      }
      interimRef.current = interim;
      setText((finalRef.current + interim).trim());
    };

    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('Microphone permission is blocked. Allow mic access for this site in your browser, then try again.');
      } else if (e.error === 'no-speech') {
        setError('I didn’t hear anything. Try again and speak clearly.');
      } else if (e.error === 'aborted') {
        return; // user cancelled — no error screen
      } else {
        setError(`Voice error: ${e.error}`);
      }
      setPhase('error');
    };

    r.onend = () => {
      if (!stoppedByUserRef.current) return;
      const t = (finalRef.current + interimRef.current).trim();
      if (t) { setText(t); setPhase('review'); }
      else { setError('I didn’t catch any words. Try again.'); setPhase('error'); }
    };

    try { r.start(); } catch { /* already started */ }
  }

  useEffect(() => {
    if (startedRef.current) return; // guard StrictMode double-mount
    startedRef.current = true;
    if (!SR) { setUnsupported(true); setPhase('error'); return; }
    startRecognition();
    return () => {
      const r = recogRef.current;
      if (r) { r.onend = null; r.onerror = null; try { r.abort(); } catch { /* noop */ } }
    };
  }, []);

  function stopAndReview() {
    stoppedByUserRef.current = true;
    try { recogRef.current?.stop(); } catch { /* noop */ }
  }

  function reRecord() {
    setError('');
    setPhase('record');
    startRecognition();
  }

  function cancel() {
    try { recogRef.current?.abort(); } catch { /* noop */ }
    onClose();
  }

  async function add() {
    const name = text.trim();
    if (!name || busy) return;
    setBusy(true);
    try { await onCreate({ name }); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={cancel}>
      <div className="modal voice-modal" onClick={(e) => e.stopPropagation()}>
        {phase === 'record' && (
          <div className="voice-stage">
            <div className="mic-orb recording"><span>🎤</span></div>
            <h2>Listening…</h2>
            <p className="voice-sub">Say the project, then tap stop. e.g. “Chase the designer for the Funkyfing mockups.”</p>
            <p className={text ? 'voice-live' : 'voice-live dim'}>{text || 'Speak now…'}</p>
            <div className="modal-actions center">
              <button className="btn ghost" onClick={cancel}>Cancel</button>
              <button className="btn primary" onClick={stopAndReview}>Stop &amp; add</button>
            </div>
          </div>
        )}

        {phase === 'review' && (
          <div className="voice-stage">
            <h2>New project</h2>
            <p className="voice-sub">Heard this — tweak if needed, then add.</p>
            <input
              className="voice-input"
              value={text}
              autoFocus
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            />
            <div className="modal-actions center">
              <button className="btn ghost" onClick={reRecord}>Re-record</button>
              <button className="btn primary" onClick={add} disabled={busy || !text.trim()}>
                {busy ? 'Adding…' : 'Add project'}
              </button>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="voice-stage">
            <div className="mic-orb error"><span>!</span></div>
            <h2>{unsupported ? 'Voice needs a different browser' : 'That didn’t work'}</h2>
            <p className="voice-sub">
              {unsupported
                ? 'Your browser doesn’t have built-in voice. Open Deck in Chrome (desktop or Android) or Safari and try again.'
                : error}
            </p>
            <div className="modal-actions center">
              <button className="btn ghost" onClick={cancel}>Close</button>
              {!unsupported && <button className="btn primary" onClick={reRecord}>Try again</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
