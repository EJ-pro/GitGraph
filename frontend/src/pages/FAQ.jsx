import { useState, useEffect } from 'react';
import { inquiryService } from '../api';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, HelpCircle, ChevronDown, ChevronUp, Mail, Phone, User, Github, Brain } from 'lucide-react';
import UserProfile from '../components/UserProfile';

function FAQ() {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [openId, setOpenId] = useState(null);
  const [activeTab, setActiveTab] = useState('faq'); // 'faq' or 'inquiry'
  const [inquiryData, setInquiryData] = useState({ title: '', content: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const faqs = [
    {
      id: 1,
      question: "What is ChatFolio?",
      answer: "ChatFolio is a portfolio optimization tool for developers that analyzes GitHub repositories to visualize dependency graphs, allowing for in-depth code analysis through AI-powered conversations."
    },
    {
      id: 2,
      question: "Can I analyze private repositories?",
      answer: "Yes, by granting 'repo' permissions during GitHub login, you can safely read and analyze your own private repositories."
    },
    {
      id: 3,
      question: "How is my analyzed data managed?",
      answer: "Collected code is used exclusively for analysis and AI context generation. It is immediately destroyed upon a user's request for deletion or when the integration is disconnected."
    },
    {
      id: 4,
      question: "What are the criteria for MBTI Persona analysis?",
      answer: "The AI defines a developer persona by comprehensively analyzing factors such as commit frequency, primary tech stack, and code style (use of comments, degree of modularization)."
    }
  ];

  const handleInquirySubmit = async (e) => {
    e.preventDefault();
    if (!inquiryData.title || !inquiryData.content) {
      alert('Please enter both title and content.');
      return;
    }

    setIsSubmitting(true);
    try {
      await inquiryService.submit(inquiryData);
      alert('Your inquiry has been successfully submitted.');
      setInquiryData({ title: '', content: '' });
      setActiveTab('faq');
    } catch (err) {
      console.error('Failed to submit inquiry:', err);
      alert(err.message || 'An error occurred while submitting your inquiry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative font-sans overflow-x-hidden">
      {/* Background Orbs - Fixed to prevent scrolling issues */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-5%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-5%] w-[50%] h-[50%] bg-purple-600/10 blur-[120px] rounded-full"></div>
      </div>

      <header className="w-full px-8 py-4 flex justify-between items-center sticky top-0 z-50 backdrop-blur-md border-b border-white/5 bg-slate-950/50">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group">
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="font-bold">Back</span>
        </button>
        <div className="flex items-center gap-3" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="font-black tracking-tighter text-xl">ChatFolio</span>
        </div>
        <UserProfile />
      </header>

      <main className="flex-grow w-full max-w-4xl mx-auto p-6 md:p-10 relative z-10">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-black text-white mb-4 tracking-tighter italic">Support Center</h1>
          <p className="text-slate-400 text-lg">How can we help you today?</p>
        </div>

        {/* Tab Toggle */}
        <div className="flex justify-center mb-10">
          <div className="bg-slate-900/80 p-1.5 rounded-2xl border border-white/5 flex gap-1">
            <button
              onClick={() => setActiveTab('faq')}
              className={`px-8 py-2.5 rounded-xl font-bold transition-all ${activeTab === 'faq' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-500 hover:text-slate-300'}`}
            >
              FAQ
            </button>
            <button
              onClick={() => setActiveTab('inquiry')}
              className={`px-8 py-2.5 rounded-xl font-bold transition-all ${activeTab === 'inquiry' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Contact Support
            </button>
          </div>
        </div>

        <div className="min-h-[400px]">
          {activeTab === 'faq' ? (
            <section className="space-y-4 animate-fade-in">
              {faqs.map((faq) => (
                <div
                  key={faq.id}
                  className="glass-panel rounded-2xl border border-white/5 overflow-hidden transition-all hover:border-white/10"
                >
                  <button
                    onClick={() => setOpenId(openId === faq.id ? null : faq.id)}
                    className="w-full p-6 flex justify-between items-center text-left"
                  >
                    <span className="text-lg font-bold text-white flex items-center gap-3">
                      <HelpCircle className="w-5 h-5 text-blue-400" />
                      {faq.question}
                    </span>
                    {openId === faq.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                  {openId === faq.id && (
                    <div className="px-6 pb-6 text-slate-400 leading-relaxed animate-fade-in">
                      <div className="pt-4 border-t border-white/5">
                        {faq.answer}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </section>
          ) : (
            <section className="animate-fade-in">
              <form onSubmit={handleInquirySubmit} className="glass-panel rounded-3xl p-8 md:p-10 border border-white/10 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-500 uppercase tracking-widest ml-1">Title</label>
                  <input
                    type="text"
                    placeholder="Enter the title"
                    value={inquiryData.title}
                    onChange={(e) => setInquiryData({ ...inquiryData, title: e.target.value })}
                    className="w-full bg-slate-950 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-purple-500/50 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-500 uppercase tracking-widest ml-1">Content</label>
                  <textarea
                    placeholder="Please describe your inquiry in detail and we'll respond as soon as possible."
                    rows={8}
                    value={inquiryData.content}
                    onChange={(e) => setInquiryData({ ...inquiryData, content: e.target.value })}
                    className="w-full bg-slate-950 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-purple-500/50 transition-colors resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-black text-lg rounded-2xl shadow-xl shadow-purple-500/20 transition-all transform hover:-translate-y-1 active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Inquiry'}
                </button>
              </form>
            </section>
          )}
        </div>

        {/* Bottom Contact Info */}
        <div className="mt-20 py-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6 text-slate-500">
          <div className="flex flex-wrap justify-center gap-8 text-sm font-bold">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-blue-400" />
              <span>CEO : Jaehee Lee</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-emerald-400" />
              <span>TEL : 02-529-4237</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-purple-400" />
              <span>Mail : ChatFolio@chatfolio.com</span>
            </div>
          </div>
          <div className="text-[10px] uppercase font-black tracking-widest opacity-30">
            Powered by ChatFolio AI
          </div>
        </div>
      </main>

      <footer className="w-full text-center p-4 text-slate-600 text-sm border-t border-white/5">
        &copy; 2026 ChatFolio. All rights reserved.
      </footer>
    </div>
  );
}

export default FAQ;
