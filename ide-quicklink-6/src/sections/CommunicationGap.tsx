import { Zap, HeartHandshake } from 'lucide-react';

export function CommunicationGap() {
  return (
    <section id="gap" className="py-32 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
        {/* Editorial Header */}
        <div className="max-w-3xl mb-16">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-tight font-display mb-6 text-balance">
            Communication should never be a barrier.
          </h2>
          <p className="text-base sm:text-lg text-[#D1D1D6] leading-relaxed font-normal">
            For people with ALS, cerebral palsy, Parkinson's, stroke, or laryngectomy, speaking can be exhausting.
            Communication is more than slow, letter-by-letter tools.
          </p>
        </div>

        {/* 2-Column Split: Storytelling Card & Comparative Analysis */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Column: Visual Storytelling Asset */}
          <div className="lg:col-span-5 rounded-3xl overflow-hidden igloo-glass border border-white/10 relative min-h-[440px] flex flex-col justify-end p-8 md:p-10 group">
            <img
              src="/src/assets/images/echo_human_connection_1793438132375.jpg"
              alt="Two individuals engaged in authentic, expressive conversation"
              className="absolute inset-0 w-full h-full object-cover grayscale contrast-110 transition-transform duration-700 group-hover:scale-105"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0E] via-[#0D0D0E]/60 to-transparent" />
            
            <div className="relative z-10">
              <span className="text-xs font-mono text-white tracking-widest uppercase block mb-1">
                Authentic Connection
              </span>
              <h3 className="text-2xl font-bold text-white mb-2 font-display">
                Supporting natural expression
              </h3>
              <p className="text-xs text-[#D1D1D6] leading-relaxed">
                Project Echo explores ways to help people express complete thoughts while keeping every message under their control.
              </p>
            </div>
          </div>

          {/* Right Column: Comparative Analysis */}
          <div className="lg:col-span-7 flex flex-col justify-between rounded-3xl igloo-glass-elevated border border-white/15 p-8 md:p-10 shadow-2xl">
            <div>
              <div className="flex items-center justify-between flex-wrap gap-4 mb-8 pb-4 border-b border-white/10">
                <h3 className="text-xl font-bold text-white font-display">
                  A communication concept
                </h3>
              </div>

              <div className="space-y-6">
                  <div className="p-5 rounded-2xl bg-white/10 border border-white/30 shadow-[0_0_25px_rgba(255,255,255,0.1)]">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-white/15 text-white shrink-0">
                        <Zap className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="text-base font-semibold text-white mb-1">
                          Express a complete thought
                        </h4>
                        <p className="text-sm text-[#D1D1D6] leading-relaxed">
                          Choose a sample message, edit the wording, and decide whether to speak it aloud.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-white/[0.05] border border-white/15">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-white/10 text-white shrink-0">
                        <HeartHandshake className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="text-base font-semibold text-white mb-1">
                          The user stays in control
                        </h4>
                        <p className="text-sm text-[#D1D1D6] leading-relaxed">
                          Nothing is spoken until the user confirms the message.
                        </p>
                      </div>
                    </div>
                  </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
