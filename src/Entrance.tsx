import { useEffect, useState } from 'react';
import { ArrowRight, Crown, Shield, Sparkles } from 'lucide-react';

export default function Entrance({ onEnter }: { onEnter: (profile: string) => void }) {
  const [profile, setProfile] = useState('joel');

  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.accent = 'amber';
  }, []);

  return (
    <main className="entrance" aria-labelledby="entrance-title">
      <img
        className="entrance-art"
        src="/olympus-gates.svg"
        alt="A marble statue of Commissioner Thundercock stands over a shattered purple Yahoo logo beside the golden Elysian Gates, opening onto sunlit clouds."
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
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onEnter(profile);
          }}
        >
          <label htmlFor="entrance-profile">CHOOSE YOUR PROFILE</label>
          <select
            id="entrance-profile"
            value={profile}
            onChange={(event) => setProfile(event.target.value)}
          >
            <option value="joel">Joel Shelton</option>
            <option value="guest">Guest profile</option>
          </select>
          <button className="entrance-enter" type="submit">
            Enter the fields <ArrowRight size={18} />
          </button>
        </form>
        <p className="entrance-note">
          <Shield size={14} /> Local demo · No password needed
        </p>
      </section>
    </main>
  );
}
