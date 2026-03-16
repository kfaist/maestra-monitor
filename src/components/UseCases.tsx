'use client';

export default function UseCases() {
  return (
    <>
      <div className="use-cases">
        <div className="section-title">// How You&apos;d Use This</div>
        <div className="scenarios">
          <div className="scenario">
            <div className="scenario-title">Multi-Screen VJ Set</div>
            <div className="scenario-desc">
              Each screen runs its own TD + Scope instance doing real-time AI generation. Maestra syncs scene changes, prompt updates, and color palettes across every machine. One state push switches the whole venue.
            </div>
          </div>
          <div className="scenario">
            <div className="scenario-title">Gallery Installation</div>
            <div className="scenario-desc">
              Register each station as an entity. Sync brightness based on time of day, coordinate color transitions, advertise NDI streams so curators can monitor every feed from a single dashboard.
            </div>
          </div>
          <div className="scenario">
            <div className="scenario-title">Festival Projection Mapping</div>
            <div className="scenario-desc">
              Multiple building facades with different TD machines. Maestra manages scene changes across the fleet &mdash; one API call switches every projector to the next act. Heartbeats alert you if any machine drops.
            </div>
          </div>
        </div>
      </div>
      <div className="code-block">
        <span className="cmt"># In TouchDesigner after dropping the Maestra TOX into your project:</span><br /><br />
        <span className="kw">maestra</span> = op(<span className="str">&apos;maestra&apos;</span>).ext.MaestraExt<br /><br />
        <span className="cmt"># Register this machine with the fleet</span><br />
        maestra.<span className="fn">Connect</span>()&nbsp;&nbsp;<span className="cmt"># uses Entity ID + Server URL from custom pars</span><br /><br />
        <span className="cmt"># Push state every connected client sees the update</span><br />
        maestra.<span className="fn">UpdateState</span>(&#123;<span className="str">&apos;brightness&apos;</span>: <span className="num">75</span>, <span className="str">&apos;scene&apos;</span>: <span className="num">2</span>, <span className="str">&apos;color&apos;</span>: [<span className="num">0.8</span>, <span className="num">0.2</span>, <span className="num">1.0</span>]&#125;)<br /><br />
        <span className="cmt"># Advertise your NDI output so other machines can discover it</span><br />
        maestra.<span className="fn">AdvertiseStream</span>(name=<span className="str">&apos;Stage Visuals&apos;</span>, stream_type=<span className="str">&apos;ndi&apos;</span>, protocol=<span className="str">&apos;ndi&apos;</span>)<br /><br />
        <span className="cmt"># From another machine discover what&apos;s available</span><br />
        streams = maestra.<span className="fn">ListStreams</span>(stream_type=<span className="str">&apos;ndi&apos;</span>)
      </div>
    </>
  );
}
