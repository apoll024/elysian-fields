import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Crown, Shield, Sparkles } from 'lucide-react';

const accounts = ['Ryan', 'Gary', 'Rick', 'Reo', 'Kyle', 'Jeff', 'Joel', 'Kunal', 'Marko', 'Jonny'];

export default function Entrance({
  onEnter,
  error,
  busy,
}: {
  onEnter: (username: string, password: string) => Promise<void>;
  error: string;
  busy: boolean;
}) {
  const [username, setUsername] = useState('Ryan');
  const [password, setPassword] = useState('');
  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.accent = 'amber';
  }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    void onEnter(username, password);
  }
  return (
    <main className="entrance" aria-labelledby="entrance-title">
      <img
        className="entrance-art"
        src="/olympus-gates.svg"
        alt="A marble statue beside the gilded Elysian Gates, opening onto sunlit clouds."
        fetchPriority="high"
        width="1672"
        height="941"
      />
      <section className="entrance-panel">
        <div className="entrance-emblem" aria-hidden="true">
          <Crown size={25} />
        </div>
        <p className="entrance-kicker">FANTASY FOOTBALL · ABOVE THE ORDINARY</p>
        <h1 id="entrance-title">
          Elysian
          <br />
          <em>Fields</em>
        </h1>
        <div className="entrance-rule" aria-hidden="true">
          <Sparkles size={15} />
        </div>
        <p className="entrance-welcome">Your league. Your legacy.</p>
        <p className="entrance-description">
          The gates are open. Take your place among the legends.
        </p>
        <form onSubmit={submit}>
          <label htmlFor="entrance-profile">ACCOUNT</label>
          <select
            id="entrance-profile"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          >
            {accounts.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <label htmlFor="entrance-password">PASSWORD</label>
          <input
            id="entrance-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && (
            <p className="entrance-error" role="alert">
              {error}
            </p>
          )}
          <button className="entrance-enter" type="submit" disabled={busy}>
            {busy ? 'Opening the gates…' : 'Enter the fields'} <ArrowRight size={18} />
          </button>
        </form>
        <p className="entrance-note">
          <Shield size={14} /> Your roster follows your account
        </p>
      </section>
    </main>
  );
}
