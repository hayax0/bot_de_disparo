"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/store/useAuth';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import axios from 'axios';
import { 
  Bot, 
  LogOut, 
  Smartphone, 
  Play, 
  Pause, 
  Trash2, 
  Plus, 
  QrCode, 
  HelpCircle, 
  FileJson, 
  ExternalLink, 
  CheckCircle2, 
  Sparkles, 
  ShieldCheck, 
  Clock, 
  ChevronRight, 
  BookOpen, 
  Info, 
  X, 
  Menu, 
  Eye, 
  Search, 
  AlertTriangle, 
  RefreshCw, 
  Globe, 
  MapPin, 
  Check, 
  AlertCircle 
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  status: string;
  messageComSite?: string | null;
  messageSemSite?: string | null;
  delayMin: number;
  delayMax: number;
  createdAt: string;
  _count?: {
    leads: number;
  };
}

interface Lead {
  id: string;
  title: string;
  phone: string;
  website?: string | null;
  neighborhood?: string | null;
  status: 'PENDING' | 'SENT' | 'REPLIED' | 'ERROR' | 'IGNORED';
  errorMessage?: string | null;
  sentAt?: string | null;
}

interface CampaignDetails {
  campaign: Campaign;
  leads: Lead[];
  counts: {
    total: number;
    pending: number;
    sent: number;
    replied: number;
    error: number;
  };
}

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export default function Dashboard() {
  const { token, user, isHydrated, hydrate, logout } = useAuth();
  const router = useRouter();
  
  const [waStatus, setWaStatus] = useState<{ status: string; qrCode?: string | null } | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Inicializar hidratação segura do Zustand client-side
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  
  // Modais e Drawers
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignDetails, setCampaignDetails] = useState<CampaignDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [leadFilterStatus, setLeadFilterStatus] = useState<string>('ALL');
  const [leadSearchTerm, setLeadSearchTerm] = useState('');
  
  // Modal de Confirmação de Exclusão
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);

  // Mobile sidebar
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  // Carregar status do WhatsApp
  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/whatsapp/status');
      setWaStatus(res.data);
    } catch {
      // Polling silencioso
    }
  }, []);

  // Carregar campanhas
  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await api.get('/campaigns');
      setCampaigns(res.data);
    } catch (err: unknown) {
      let msg = 'Erro ao carregar campanhas.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!token) {
      router.push('/login');
      return;
    }
    let isMounted = true;
    const loadData = async () => {
      if (isMounted) {
        await Promise.all([fetchStatus(), fetchCampaigns()]);
      }
    };
    loadData();
    const interval = setInterval(fetchStatus, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isHydrated, token, fetchStatus, fetchCampaigns, router]);

  // Tecla ESC para fechar modais
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
        setIsTutorialOpen(false);
        setSelectedCampaignId(null);
        setCampaignToDelete(null);
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleConnect = async () => {
    try {
      await api.post('/whatsapp/connect');
      addToast('info', 'Inicializando conexão com o WhatsApp...');
      fetchStatus();
    } catch (err: unknown) {
      let msg = 'Erro ao conectar WhatsApp.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    }
  };

  const handleDisconnect = async () => {
    try {
      await api.post('/whatsapp/disconnect');
      addToast('info', 'WhatsApp desconectado com sucesso.');
      fetchStatus();
    } catch (err: unknown) {
      let msg = 'Erro ao desconectar.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    }
  };

  // Carregar detalhes dos leads da campanha
  const openCampaignDetails = async (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    setIsLoadingDetails(true);
    try {
      const res = await api.get(`/campaigns/${campaignId}/leads`);
      setCampaignDetails(res.data);
    } catch (err: unknown) {
      let msg = 'Erro ao carregar detalhes dos leads.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
      setSelectedCampaignId(null);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const defaultComSite = "{Fala|Olá|Oi}, {nome}! {Tudo bem|Tudo certo}?\n\n{meuNome} por aqui. Estava analisando a estrutura de vocês e vi que vocês já possuem um site ativo ({website}). Mas me diz uma coisa: quanto tempo a sua equipe perde na semana respondendo mensagem de curioso no WhatsApp que só quer saber preço e não tem perfil pra fechar?\n\nA gente implementou uma camada de triagem automática que roda no próprio site de vocês, educa o cliente, filtra o orçamento e só joga pro seu WhatsApp quem tá pronto pra fechar contrato.\n\nFaria sentido eu te mandar um áudio de 45 segundos mostrando como aplicar isso na {nome}?";
  const defaultSemSite = "{Fala|Olá|Oi}, {nome}! {Tudo bem|Tudo certo}?\n\n{meuNome} por aqui. Estava dando uma olhada na presença de vocês em {bairro} e vi que vocês ainda não têm um site próprio no ar. Como o cliente de maior ticket sempre pesquisa a credibilidade da empresa no Google antes de fechar, eu montei uma demonstração prática de como ficaria a página da {nome} no ar com filtro de clientes automático.\n\nFaria sentido eu te mandar o link desse protótipo pra você dar uma olhada em 1 minuto?";
  const defaultB2B = "{Fala|Olá|Oi}, {nome}! {Tudo bem|Como vai}?\n\nVi a atuação de vocês em {bairro} e achei muito interessante o trabalho da {nome}. Nós ajudamos empresas do seu segmento a aumentarem o volume de contatos qualificados todos os meses através da internet.\n\nVocê teria 2 minutinhos essa semana para batermos um papo rápido e eu te apresentar uma ideia simples que pode gerar mais clientes para a {nome}?";

  const [newCampaign, setNewCampaign] = useState({ 
    name: '', 
    messageComSite: '', 
    messageSemSite: '', 
    file: null as File | null, 
    delayMin: 90, 
    delayMax: 180 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaign.file) {
      addToast('error', 'Por favor, anexe o arquivo de leads (.json ou .csv).');
      return;
    }
    if (!newCampaign.messageSemSite.trim() && !newCampaign.messageComSite.trim()) {
      addToast('error', 'Por favor, escreva ao menos uma mensagem para a campanha (sem site, com site ou ambas).');
      return;
    }
    setIsSubmitting(true);
    try {
      // 1. Criar campanha
      const res = await api.post('/campaigns', {
        name: newCampaign.name,
        messageComSite: newCampaign.messageComSite.trim() || null,
        messageSemSite: newCampaign.messageSemSite.trim() || null,
        delayMin: newCampaign.delayMin,
        delayMax: newCampaign.delayMax
      });
      const campaignId = res.data.id;

      // 2. Upload leads
      const formData = new FormData();
      formData.append('file', newCampaign.file);
      const importRes = await api.post(`/campaigns/${campaignId}/leads/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      addToast('success', `Campanha criada! ${importRes.data.imported} leads importados com sucesso (${importRes.data.skipped} ignorados/duplicados).`);
      setIsModalOpen(false);
      setNewCampaign({ 
        name: '', 
        messageComSite: '', 
        messageSemSite: '', 
        file: null, 
        delayMin: 90, 
        delayMax: 180 
      });
      fetchCampaigns();
    } catch (err: unknown) {
      let msg = 'Erro ao criar campanha.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStart = async (id: string) => {
    try {
      const res = await api.post(`/campaigns/${id}/start`);
      addToast('success', res.data.message || 'Campanha iniciada com sucesso!');
      fetchCampaigns();
      if (selectedCampaignId === id) openCampaignDetails(id);
    } catch (err: unknown) {
      let msg = 'Erro ao iniciar campanha.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    }
  };

  const handlePause = async (id: string) => {
    try {
      await api.post(`/campaigns/${id}/pause`);
      addToast('info', 'Campanha pausada.');
      fetchCampaigns();
      if (selectedCampaignId === id) openCampaignDetails(id);
    } catch (err: unknown) {
      let msg = 'Erro ao pausar campanha.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    }
  };

  const confirmDelete = async () => {
    if (!campaignToDelete) return;
    try {
      await api.delete(`/campaigns/${campaignToDelete.id}`);
      addToast('success', 'Campanha excluída com sucesso.');
      setCampaignToDelete(null);
      if (selectedCampaignId === campaignToDelete.id) {
        setSelectedCampaignId(null);
      }
      fetchCampaigns();
    } catch (err: unknown) {
      let msg = 'Erro ao excluir campanha.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    }
  };

  // Filtragem de leads na visualização da campanha
  const filteredLeads = useMemo(() => {
    if (!campaignDetails?.leads) return [];
    return campaignDetails.leads.filter(lead => {
      const matchesStatus = leadFilterStatus === 'ALL' || lead.status === leadFilterStatus;
      const matchesSearch = leadSearchTerm === '' || 
        lead.title.toLowerCase().includes(leadSearchTerm.toLowerCase()) ||
        lead.phone.includes(leadSearchTerm) ||
        (lead.website && lead.website.toLowerCase().includes(leadSearchTerm.toLowerCase())) ||
        (lead.neighborhood && lead.neighborhood.toLowerCase().includes(leadSearchTerm.toLowerCase()));
      return matchesStatus && matchesSearch;
    });
  }, [campaignDetails, leadFilterStatus, leadSearchTerm]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row relative">
      
      {/* Toast Notifications Container */}
      <div className="fixed top-4 right-4 left-4 sm:left-auto z-50 flex flex-col gap-2 sm:max-w-sm w-auto pointer-events-none">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={`pointer-events-auto p-4 rounded-2xl shadow-lg border flex items-start gap-3 transition-all duration-300 animate-in slide-in-from-top-2 ${
              t.type === 'success' 
                ? 'bg-emerald-950 text-emerald-100 border-emerald-800' 
                : t.type === 'error' 
                ? 'bg-red-950 text-red-100 border-red-800' 
                : 'bg-slate-900 text-white border-slate-700'
            }`}
          >
            {t.type === 'success' && <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />}
            {t.type === 'error' && <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />}
            {t.type === 'info' && <Info size={18} className="text-brand-400 shrink-0 mt-0.5" />}
            <div className="text-xs leading-relaxed font-medium flex-1">{t.message}</div>
          </div>
        ))}
      </div>

      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-slate-200 p-3.5 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand-600 text-white rounded-xl flex items-center justify-center shadow-xs">
            <Bot size={18} />
          </div>
          <span className="font-bold text-slate-900 text-sm">Disparador de Mensagens</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button 
            onClick={logout}
            title="Sair da conta"
            aria-label="Sair da conta"
            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
          >
            <LogOut size={18} />
          </button>
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            aria-label="Abrir Menu"
          >
            <Menu size={20} />
          </button>
        </div>
      </div>

      {/* Sidebar (Desktop & Mobile Drawer) */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 sm:w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 md:static md:translate-x-0 shadow-2xl md:shadow-none
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Brand Header */}
        <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-100/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-brand-600 text-white rounded-xl flex items-center justify-center shadow-xs">
              <Bot size={20} />
            </div>
            <div>
              <span className="font-bold text-slate-900 tracking-tight block text-sm leading-tight">Disparador</span>
              <span className="text-[11px] text-brand-600 font-semibold block leading-tight">de Mensagens</span>
            </div>
          </div>
          {/* Botão de Fechar no Mobile */}
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Fechar menu lateral"
            className="md:hidden p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* User Account Card com Botão de Sair no Topo */}
        <div className="p-3 mx-3 mt-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between gap-2 shadow-2xs">
          <div className="min-w-0 flex-1 pl-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Conta</span>
            <span suppressHydrationWarning className="text-xs font-semibold text-slate-800 block truncate">
              {isHydrated && user ? (user.name || user.email || 'Minha Conta') : 'Minha Conta'}
            </span>
          </div>
          <button 
            onClick={() => {
              setIsMobileMenuOpen(false);
              logout();
            }}
            title="Sair da conta"
            aria-label="Sair da conta"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer shrink-0"
          >
            <LogOut size={14} />
            <span>Sair</span>
          </button>
        </div>
        
        <nav className="flex-1 px-3 py-3 space-y-1">
          <a 
            href="#" 
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-3 px-3.5 py-2.5 text-sm font-semibold rounded-xl bg-brand-50 text-brand-600 shadow-xs"
          >
            <Smartphone size={18} />
            Dashboard
          </a>
        </nav>
      </aside>

      {/* Backdrop Mobile */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 md:hidden animate-in fade-in"
        />
      )}

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
          
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Visão Geral</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">Conecte seu WhatsApp, importe leads do Apify e dispare com segurança anti-ban.</p>
            </div>
            <button 
              onClick={() => setIsTutorialOpen(true)}
              className="inline-flex items-center justify-center gap-2 text-xs font-semibold text-brand-600 bg-white border border-brand-200 px-4 py-2.5 rounded-xl hover:bg-brand-50 transition-all shadow-xs cursor-pointer w-full sm:w-auto"
            >
              <HelpCircle size={15} />
              Como gerar lista no Apify?
            </button>
          </header>

          {/* Guia Rápido de 3 Passos */}
          <section className="bg-gradient-to-br from-indigo-900 via-brand-900 to-slate-900 rounded-3xl p-5 sm:p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="flex items-center gap-2.5 text-brand-300 text-xs font-bold uppercase tracking-wider mb-2 sm:mb-3">
              <Sparkles size={16} /> Fluxo de Prospecção
            </div>
            <h2 className="text-lg sm:text-xl md:text-2xl font-semibold mb-4 sm:mb-6">Disparos em 3 Etapas Simples</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
              
              {/* Passo 1 */}
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 flex flex-col justify-between">
                <div>
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-brand-500/30 text-brand-200 flex items-center justify-center font-bold text-xs sm:text-sm mb-2.5">
                    1
                  </div>
                  <h3 className="font-semibold text-sm text-white mb-1">Conecte o WhatsApp</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Escaneie o QR Code para parear o número que fará o disparo das mensagens.
                  </p>
                </div>
                <div className="mt-3.5 flex items-center gap-1.5 text-[11px] font-medium text-brand-200">
                  <ShieldCheck size={14} /> Digitação humana simulada
                </div>
              </div>

              {/* Passo 2 */}
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 flex flex-col justify-between">
                <div>
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-brand-500/30 text-brand-200 flex items-center justify-center font-bold text-xs sm:text-sm mb-2.5">
                    2
                  </div>
                  <h3 className="font-semibold text-sm text-white mb-1">Extraia Leads no Apify</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Busque seu nicho no Google Maps Scraper do Apify e exporte a lista em formato <b>.JSON</b>.
                  </p>
                </div>
                <button 
                  onClick={() => setIsTutorialOpen(true)}
                  className="mt-3.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-300 hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Ver tutorial passo a passo <ChevronRight size={12} />
                </button>
              </div>

              {/* Passo 3 */}
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 flex flex-col justify-between">
                <div>
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-brand-500/30 text-brand-200 flex items-center justify-center font-bold text-xs sm:text-sm mb-2.5">
                    3
                  </div>
                  <h3 className="font-semibold text-sm text-white mb-1">Inicie a Campanha</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Faça o upload do JSON. O robô limpa razões sociais, valida sites reais e envia em lotes de 8.
                  </p>
                </div>
                <div className="mt-3.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-300">
                  <Clock size={14} /> Pausa de 15 min a cada 8 envios
                </div>
              </div>

            </div>
          </section>

          {/* WhatsApp Status Card */}
          <section className="card-premium flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 ${waStatus?.status === 'CONNECTED' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                <Smartphone size={22} />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-sm sm:text-base">Status do WhatsApp</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="relative flex h-2.5 w-2.5">
                    {waStatus?.status === 'CONNECTED' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${waStatus?.status === 'CONNECTED' ? 'bg-green-500' : 'bg-slate-300'}`}></span>
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    {waStatus?.status === 'CONNECTED' ? 'Conectado e Pronto' : waStatus?.status === 'QRCODE' ? 'Aguardando Leitura do QR Code' : 'Desconectado'}
                  </span>
                </div>
              </div>
            </div>

            <div className="w-full sm:w-auto flex items-center gap-2">
              {waStatus?.status === 'DISCONNECTED' && (
                <button onClick={handleConnect} className="btn-premium w-full sm:w-auto cursor-pointer">
                  Conectar WhatsApp
                </button>
              )}
              {waStatus?.status === 'QRCODE' && (
                <>
                  <button 
                    onClick={handleConnect} 
                    className="w-full sm:w-auto px-3.5 py-2 text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-200 rounded-xl hover:bg-brand-100 transition-colors cursor-pointer text-center"
                  >
                    🔄 Atualizar QR Code
                  </button>
                  <button 
                    onClick={handleDisconnect} 
                    className="w-full sm:w-auto px-3.5 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer text-center"
                  >
                    Cancelar
                  </button>
                </>
              )}
              {waStatus?.status === 'CONNECTED' && (
                <button onClick={handleDisconnect} className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors cursor-pointer text-center">
                  Desconectar
                </button>
              )}
            </div>
          </section>

          {/* QR Code display */}
          {waStatus?.status === 'QRCODE' && waStatus.qrCode && (
            <div className="card-premium flex flex-col items-center justify-center py-6 sm:py-8">
              <QrCode className="text-brand-500 mb-3" size={32} />
              <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-1.5 text-center">Escaneie o QR Code</h3>
              <p className="text-xs text-slate-500 mb-5 text-center max-w-sm px-2">Abra o WhatsApp no celular, vá em <b>Aparelhos Conectados &gt; Conectar um aparelho</b> e aponte a câmera.</p>
              <div className="bg-white p-3.5 rounded-2xl shadow-md border border-slate-100 relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={waStatus.qrCode} 
                  alt="QR Code WhatsApp" 
                  className="w-56 h-56 sm:w-64 sm:h-64 rounded-xl object-contain"
                />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={handleConnect}
                  className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                >
                  🔄 QR Code expirou? Clique para gerar um novo
                </button>
              </div>
            </div>
          )}

          {/* Campaigns Section */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Minhas Campanhas</h2>
                <p className="text-xs text-slate-500">Gerencie seus disparos e acompanhe o status de cada contato.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(true)} 
                className="flex items-center justify-center gap-2 text-xs font-semibold text-white bg-brand-600 px-4 py-2.5 rounded-xl hover:bg-brand-500 transition-all shadow-sm cursor-pointer w-full sm:w-auto"
              >
                <Plus size={16} /> Nova Campanha
              </button>
            </div>
            
            <div className="grid gap-3.5 sm:gap-4">
              {isLoading ? (
                <div className="card-premium text-center py-12 text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw className="animate-spin text-brand-600" size={20} />
                  <span className="text-sm">Carregando campanhas...</span>
                </div>
              ) : campaigns.length === 0 ? (
                <div className="card-premium text-center py-10 sm:py-12 text-slate-500">
                  <FileJson className="mx-auto text-slate-300 mb-3" size={36} />
                  <p className="font-medium text-slate-700 text-sm sm:text-base">Nenhuma campanha criada ainda.</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Extraia sua lista no Apify, clique em &quot;Nova Campanha&quot; e faça o upload do arquivo .json.</p>
                  <button 
                    onClick={() => setIsModalOpen(true)} 
                    className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-brand-600 bg-brand-50 px-4 py-2.5 rounded-xl hover:bg-brand-100 transition-colors cursor-pointer"
                  >
                    <Plus size={14} /> Criar Primeira Campanha
                  </button>
                </div>
              ) : (
                campaigns.map(c => (
                  <div key={c.id} className="card-premium flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <h3 className="font-bold text-slate-900 text-sm sm:text-base">{c.name}</h3>
                        <span className={`text-[10px] sm:text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                          c.status === 'RUNNING' 
                            ? 'bg-green-100 text-green-700' 
                            : c.status === 'PAUSED' 
                            ? 'bg-amber-100 text-amber-700' 
                            : c.status === 'COMPLETED'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {c.status === 'RUNNING' ? 'Em Disparo' : c.status === 'PAUSED' ? 'Pausada' : c.status === 'COMPLETED' ? 'Concluída' : c.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        <b className="text-slate-700">{c._count?.leads || 0} leads</b> • Delay: <b>{c.delayMin}s a {c.delayMax}s</b> • Pausa a cada 8 envios: <b>15 min</b>
                      </p>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0 border-t border-slate-100 md:border-t-0">
                      <button 
                        onClick={() => openCampaignDetails(c.id)}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-brand-700 bg-brand-50 rounded-xl hover:bg-brand-100 transition-colors cursor-pointer"
                        title="Ver Leads e Métricas"
                      >
                        <Eye size={14} /> Detalhes
                      </button>

                      {c.status === 'PAUSED' || c.status === 'DRAFT' ? (
                        <button 
                          onClick={() => handleStart(c.id)} 
                          className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-green-700 bg-green-50 rounded-xl hover:bg-green-100 transition-colors cursor-pointer" 
                          title="Iniciar Disparos"
                        >
                          <Play size={14} /> Iniciar
                        </button>
                      ) : (
                        <button 
                          onClick={() => handlePause(c.id)} 
                          className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-orange-700 bg-orange-50 rounded-xl hover:bg-orange-100 transition-colors cursor-pointer" 
                          title="Pausar Disparos"
                        >
                          <Pause size={14} /> Pausar
                        </button>
                      )}
                      
                      <button 
                        onClick={() => setCampaignToDelete(c)} 
                        className="p-2 text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors cursor-pointer shrink-0" 
                        title="Excluir Campanha"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

        </div>
      </main>

      {/* Modal de Detalhes da Campanha & Tabela de Leads */}
      {selectedCampaignId && (
        <div 
          role="dialog" 
          aria-modal="true" 
          aria-labelledby="title-details-campaign"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 animate-in fade-in"
        >
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-4xl max-h-[92vh] sm:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="pr-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 id="title-details-campaign" className="text-lg sm:text-xl font-bold text-slate-900 truncate max-w-[240px] sm:max-w-md">
                    {campaignDetails?.campaign.name || 'Detalhes da Campanha'}
                  </h2>
                  <span className={`text-[10px] sm:text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                    campaignDetails?.campaign.status === 'RUNNING' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {campaignDetails?.campaign.status === 'RUNNING' ? 'Em Disparo' : 'Pausada'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Acompanhamento e auditoria de cada lead importado.</p>
              </div>
              <button 
                onClick={() => setSelectedCampaignId(null)}
                aria-label="Fechar detalhes da campanha"
                className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              >
                <X size={20} />
              </button>
            </div>

            {isLoadingDetails ? (
              <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="animate-spin text-brand-600" size={24} />
                <span className="text-sm">Carregando leads...</span>
              </div>
            ) : (
              <div className="p-4 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6 flex-1">
                
                {/* Cards de Métricas */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3">
                  <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-2xl">
                    <span className="text-[11px] text-slate-500 font-medium">Total</span>
                    <p className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">{campaignDetails?.counts.total || 0}</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200/80 p-3 rounded-2xl">
                    <span className="text-[11px] text-amber-700 font-medium">Pendentes</span>
                    <p className="text-lg sm:text-xl font-bold text-amber-800 mt-0.5">{campaignDetails?.counts.pending || 0}</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200/80 p-3 rounded-2xl">
                    <span className="text-[11px] text-emerald-700 font-medium">Enviados</span>
                    <p className="text-lg sm:text-xl font-bold text-emerald-800 mt-0.5">{campaignDetails?.counts.sent || 0}</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-200/80 p-3 rounded-2xl">
                    <span className="text-[11px] text-purple-700 font-medium">Respondidos</span>
                    <p className="text-lg sm:text-xl font-bold text-purple-800 mt-0.5">{campaignDetails?.counts.replied || 0}</p>
                  </div>
                  <div className="bg-red-50 border border-red-200/80 p-3 rounded-2xl col-span-2 sm:col-span-1">
                    <span className="text-[11px] text-red-700 font-medium">Erros</span>
                    <p className="text-lg sm:text-xl font-bold text-red-800 mt-0.5">{campaignDetails?.counts.error || 0}</p>
                  </div>
                </div>

                {/* Barra de Progresso Visual */}
                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1.5 font-medium">
                    <span>Progresso dos Disparos</span>
                    <span>
                      {campaignDetails?.counts.total ? Math.round(((campaignDetails.counts.sent + campaignDetails.counts.replied) / campaignDetails.counts.total) * 100) : 0}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 sm:h-3 overflow-hidden flex">
                    <div 
                      className="bg-emerald-500 transition-all duration-500"
                      style={{ width: `${campaignDetails?.counts.total ? ((campaignDetails.counts.sent + campaignDetails.counts.replied) / campaignDetails.counts.total) * 100 : 0}%` }}
                    />
                    <div 
                      className="bg-red-400 transition-all duration-500"
                      style={{ width: `${campaignDetails?.counts.total ? (campaignDetails.counts.error / campaignDetails.counts.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Barra de Filtros e Busca */}
                <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
                  <div className="relative w-full sm:w-72">
                    <Search size={15} className="absolute left-3 top-3 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Buscar lead, telefone..."
                      value={leadSearchTerm}
                      onChange={e => setLeadSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    />
                  </div>

                  <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    {[
                      { key: 'ALL', label: 'Todos' },
                      { key: 'PENDING', label: 'Pendentes' },
                      { key: 'SENT', label: 'Enviados' },
                      { key: 'ERROR', label: 'Erros' }
                    ].map(f => (
                      <button
                        key={f.key}
                        onClick={() => setLeadFilterStatus(f.key)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer shrink-0 ${
                          leadFilterStatus === f.key 
                            ? 'bg-brand-600 text-white' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tabela de Leads */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                        <tr>
                          <th className="p-3">Empresa</th>
                          <th className="p-3">Telefone</th>
                          <th className="p-3">Site / Bairro</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Envio / Detalhe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredLeads.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-slate-400">
                              Nenhum lead encontrado com os filtros atuais.
                            </td>
                          </tr>
                        ) : (
                          filteredLeads.map(lead => (
                            <tr key={lead.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="p-3 font-semibold text-slate-900 max-w-[160px] sm:max-w-[200px] truncate">{lead.title}</td>
                              <td className="p-3 text-slate-600 font-mono whitespace-nowrap">{lead.phone}</td>
                              <td className="p-3 text-slate-500 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  {lead.website ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium max-w-[120px] truncate">
                                      <Globe size={11} /> Site
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-[11px]">Sem site</span>
                                  )}
                                  {lead.neighborhood && (
                                    <span className="inline-flex items-center gap-0.5 text-slate-500 max-w-[100px] truncate text-[11px]">
                                      <MapPin size={11} /> {lead.neighborhood}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 whitespace-nowrap">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px] sm:text-xs ${
                                  lead.status === 'SENT'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : lead.status === 'PENDING'
                                    ? 'bg-amber-100 text-amber-700'
                                    : lead.status === 'REPLIED'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-red-100 text-red-700'
                                }`}>
                                  {lead.status === 'SENT' && <Check size={11} />}
                                  {lead.status === 'PENDING' && <Clock size={11} />}
                                  {lead.status === 'ERROR' && <AlertCircle size={11} />}
                                  {lead.status}
                                </span>
                              </td>
                              <td className="p-3 text-slate-400 text-[11px] max-w-[140px] truncate">
                                {lead.sentAt ? new Date(lead.sentAt).toLocaleTimeString() : (lead.errorMessage || '—')}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setSelectedCampaignId(null)}
                className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer text-center"
              >
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {campaignToDelete && (
        <div 
          role="dialog" 
          aria-modal="true" 
          aria-labelledby="title-delete-campaign"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in"
        >
          <div className="bg-white rounded-3xl w-full max-w-md p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 id="title-delete-campaign" className="text-base sm:text-lg font-bold text-slate-900">Excluir Campanha</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Tem certeza que deseja excluir permanentemente a campanha <b>&quot;{campaignToDelete.name}&quot;</b> e todos os seus leads? Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2">
              <button 
                onClick={() => setCampaignToDelete(null)}
                className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer text-center"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDelete}
                className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors cursor-pointer text-center"
              >
                Sim, Excluir Campanha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Campanha */}
      {isModalOpen && (
        <div 
          role="dialog" 
          aria-modal="true" 
          aria-labelledby="title-new-campaign"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 animate-in fade-in"
        >
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 id="title-new-campaign" className="text-lg sm:text-xl font-bold text-slate-900">Criar Nova Campanha</h2>
                <p className="text-xs text-slate-500 mt-0.5">Importe sua lista do Apify e defina suas mensagens inteligentes.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                aria-label="Fechar formulário de nova campanha"
                className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer shrink-0"
              >
                <X size={20} />
              </button>
            </div>
            
            <form id="campaignForm" onSubmit={handleCreateCampaign} className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Nome da Campanha</label>
                <input 
                  type="text" 
                  required
                  autoFocus
                  value={newCampaign.name}
                  onChange={e => setNewCampaign({...newCampaign, name: e.target.value})}
                  className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow text-sm"
                  placeholder="Ex: Clínicas Odontológicas - São Paulo"
                />
              </div>

              <div className="bg-slate-50 p-3.5 sm:p-4 rounded-2xl border border-slate-200/80">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Arquivo de Leads (.JSON ou .CSV)
                  </label>
                  <button 
                    type="button" 
                    onClick={() => setIsTutorialOpen(true)}
                    className="text-xs text-brand-600 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer w-fit"
                  >
                    <HelpCircle size={13} /> Como gerar este arquivo?
                  </button>
                </div>
                <input 
                  type="file" 
                  accept=".json,.csv,text/csv,application/json"
                  required
                  onChange={e => setNewCampaign({...newCampaign, file: e.target.files ? e.target.files[0] : null})}
                  className="block w-full text-xs text-slate-500 file:mr-3 sm:file:mr-4 file:py-2.5 file:px-3 sm:file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-brand-600 file:text-white hover:file:bg-brand-500 file:transition-colors cursor-pointer"
                />
                <p className="text-[11px] text-slate-400 mt-2">
                  Aceita a exportação direta do <b>Google Maps Scraper (Apify)</b>, arquivos <b>.JSON</b> e planilhas <b>.CSV</b>.
                </p>
              </div>

              {/* Bloco de Sugestões de Copy de Alta Conversão */}
              <div className="bg-linear-to-r from-purple-50 via-indigo-50 to-brand-50 p-4 rounded-2xl border border-purple-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                    💡 Sugestões de Copys de Alta Conversão
                  </span>
                  <span className="text-[10px] text-purple-600 font-semibold bg-purple-100/80 px-2 py-0.5 rounded-full">
                    Opcional
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mb-3">
                  Você pode escrever seus próprios textos do zero ou clicar abaixo para usar modelos validados:
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCampaign({
                      ...newCampaign,
                      messageSemSite: defaultSemSite,
                      messageComSite: defaultComSite
                    })}
                    className="px-3 py-1.5 bg-white border border-purple-200 hover:border-purple-400 text-purple-800 rounded-xl text-xs font-semibold shadow-2xs hover:shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    🚀 Preencher Kit Completo (Com e Sem Site)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCampaign({ ...newCampaign, messageSemSite: defaultSemSite })}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 text-indigo-700 rounded-xl text-xs font-medium transition-all cursor-pointer"
                  >
                    ✨ Inserir Copy Venda de Site
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCampaign({ ...newCampaign, messageComSite: defaultComSite })}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-emerald-300 text-emerald-700 rounded-xl text-xs font-medium transition-all cursor-pointer"
                  >
                    🎯 Inserir Copy Triagem WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCampaign({ ...newCampaign, messageSemSite: defaultB2B })}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-brand-300 text-brand-700 rounded-xl text-xs font-medium transition-all cursor-pointer"
                  >
                    💼 Inserir Copy B2B Geral
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Delay Mínimo (segundos)</label>
                  <input 
                    type="number" 
                    required
                    min={10}
                    value={newCampaign.delayMin}
                    onChange={e => setNewCampaign({...newCampaign, delayMin: Number(e.target.value)})}
                    className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow text-sm"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Mínimo permitido: 10s (Recomendado: 90s)</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Delay Máximo (segundos)</label>
                  <input 
                    type="number" 
                    required
                    min={10}
                    value={newCampaign.delayMax}
                    onChange={e => setNewCampaign({...newCampaign, delayMax: Number(e.target.value)})}
                    className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow text-sm"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Recomendado: 180s</p>
                </div>

                {newCampaign.delayMax < newCampaign.delayMin && (
                  <div className="col-span-1 sm:col-span-2 p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2">
                    <AlertCircle size={15} className="text-red-500 shrink-0" />
                    <span>O tempo máximo de delay deve ser igual ou maior que o tempo mínimo.</span>
                  </div>
                )}
              </div>

              {/* Campo de Mensagem Principal / Sem Site */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Mensagem para Empresas <span className="text-indigo-600 font-bold">SEM SITE (ou Mensagem Padrão)</span>
                  </label>
                  <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-medium">
                    {newCampaign.messageComSite.trim() ? 'Para leads sem site' : 'Será enviada para todos'}
                  </span>
                </div>
                
                {/* Botões de atalho para tags */}
                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  <span className="text-slate-400 text-[10px] mr-1">Inserir:</span>
                  {[
                    { tag: '{nome}', label: 'Nome' },
                    { tag: '{bairro}', label: 'Bairro' },
                    { tag: '{meuNome}', label: 'Meu Nome' },
                    { tag: '{minhaEmpresa}', label: 'Minha Empresa' },
                    { tag: '{Oi|Olá|Fala}', label: 'Spintax' },
                  ].map(item => (
                    <button
                      key={item.tag}
                      type="button"
                      onClick={() => setNewCampaign({ ...newCampaign, messageSemSite: newCampaign.messageSemSite + item.tag })}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 rounded text-[10px] font-mono text-slate-600 transition-colors cursor-pointer"
                    >
                      +{item.label}
                    </button>
                  ))}
                </div>

                <textarea 
                  rows={4}
                  value={newCampaign.messageSemSite}
                  onChange={e => setNewCampaign({...newCampaign, messageSemSite: e.target.value})}
                  className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow text-sm font-sans"
                  placeholder="Escreva sua mensagem personalizada ou use os modelos acima..."
                />
              </div>

              {/* Campo de Mensagem para quem tem Site */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Mensagem para Empresas <span className="text-emerald-600 font-bold">COM SITE PRÓPRIO</span>
                  </label>
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-medium">
                    Opcional
                  </span>
                </div>

                {/* Botões de atalho para tags */}
                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  <span className="text-slate-400 text-[10px] mr-1">Inserir:</span>
                  {[
                    { tag: '{nome}', label: 'Nome' },
                    { tag: '{website}', label: 'Website' },
                    { tag: '{bairro}', label: 'Bairro' },
                    { tag: '{meuNome}', label: 'Meu Nome' },
                    { tag: '{minhaEmpresa}', label: 'Minha Empresa' },
                    { tag: '{Oi|Olá|Fala}', label: 'Spintax' },
                  ].map(item => (
                    <button
                      key={item.tag}
                      type="button"
                      onClick={() => setNewCampaign({ ...newCampaign, messageComSite: newCampaign.messageComSite + item.tag })}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-600 border border-slate-200 rounded text-[10px] font-mono text-slate-600 transition-colors cursor-pointer"
                    >
                      +{item.label}
                    </button>
                  ))}
                </div>

                <textarea 
                  rows={4}
                  value={newCampaign.messageComSite}
                  onChange={e => setNewCampaign({...newCampaign, messageComSite: e.target.value})}
                  className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow text-sm font-sans"
                  placeholder="Se deixar em branco, o robô enviará a mensagem principal para todos os contatos..."
                />
              </div>

              <div className="p-3 sm:p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1.5 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">💡 Como funcionam as variáveis e Spintax:</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Use <span className="font-mono text-brand-600 font-semibold">{'{nome}'}</span> para inserir a razão social limpa (sem LTDA, ME, MEI), <span className="font-mono text-brand-600 font-semibold">{'{website}'}</span> para o site do lead, <span className="font-mono text-brand-600 font-semibold">{'{bairro}'}</span> para a região e <span className="font-mono text-emerald-600 font-semibold">{'{Oi|Olá|Fala}'}</span> para alternar saudações automaticamente e evitar bloqueios.
                </p>
              </div>
            </form>

            <div className="p-4 sm:p-5 border-t border-slate-100 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 bg-slate-50">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer text-center"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                form="campaignForm"
                disabled={isSubmitting || newCampaign.delayMax < newCampaign.delayMin || newCampaign.delayMin < 10 || newCampaign.delayMax < 10}
                className="btn-premium text-xs cursor-pointer w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Importando Leads...' : 'Criar e Importar Lista'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tutorial Apify */}
      {isTutorialOpen && (
        <div 
          role="dialog" 
          aria-modal="true" 
          aria-labelledby="title-tutorial-apify"
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 animate-in fade-in"
        >
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shadow-xs shrink-0">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h2 id="title-tutorial-apify" className="text-base sm:text-lg font-bold text-slate-900">Tutorial: Extrair Leads no Apify</h2>
                  <p className="text-xs text-slate-500">Como gerar seu arquivo .json do Google Maps em 3 minutos.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsTutorialOpen(false)}
                aria-label="Fechar tutorial da Apify"
                className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6 flex-1 text-sm text-slate-700">
              
              {/* Passo 1 */}
              <div className="flex gap-3.5 sm:gap-4">
                <div className="w-7 h-7 rounded-full bg-brand-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-slate-900 text-sm">Acesse o Apify e abra o Scraper</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Acesse <a href="https://apify.com" target="_blank" rel="noreferrer" className="text-brand-600 font-medium inline-flex items-center gap-0.5 hover:underline">apify.com <ExternalLink size={11} /></a> (crie uma conta gratuita com $5 de créditos). No campo de busca do <b>Store</b>, procure por <b>&quot;Google Maps Scraper&quot;</b>.
                  </p>
                </div>
              </div>

              {/* Passo 2 */}
              <div className="flex gap-3.5 sm:gap-4">
                <div className="w-7 h-7 rounded-full bg-brand-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-semibold text-slate-900 text-sm">Configure sua busca de leads</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    No formulário do scraper:
                  </p>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs space-y-1">
                    <p>• <b>Search terms:</b> Digite o nicho e a cidade. Exemplo: <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-brand-700">Dentistas em São Paulo</code>.</p>
                    <p>• <b>Max items:</b> Defina a quantidade (ex: 50 a 200 leads).</p>
                  </div>
                </div>
              </div>

              {/* Passo 3 */}
              <div className="flex gap-3.5 sm:gap-4">
                <div className="w-7 h-7 rounded-full bg-brand-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-slate-900 text-sm">Inicie a extração</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Clique no botão verde <b>&quot;Save &amp; Start&quot;</b>. O robô da Apify coletará as informações em cerca de 1 a 2 minutos.
                  </p>
                </div>
              </div>

              {/* Passo 4 */}
              <div className="flex gap-3.5 sm:gap-4">
                <div className="w-7 h-7 rounded-full bg-brand-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  4
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-semibold text-slate-900 text-sm">Exporte os resultados em JSON</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Na aba de resultados (<b>Dataset</b>), clique no botão <b>Export</b> no canto superior direito, selecione o formato <b>JSON</b> e baixe o arquivo.
                  </p>
                </div>
              </div>

              {/* Passo 5 */}
              <div className="flex gap-3.5 sm:gap-4">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  5
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-slate-900 text-sm">Importe aqui no Disparador</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Clique em <b>Nova Campanha</b> nesta tela, selecione o arquivo <b>.json</b> baixado e clique em <b>Criar e Importar</b>. O bot fará todo o tratamento automático!
                  </p>
                </div>
              </div>

            </div>

            <div className="p-4 sm:p-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50">
              <span className="text-xs text-slate-500 text-center sm:text-left">Pronto para prospectar?</span>
              <button 
                onClick={() => {
                  setIsTutorialOpen(false);
                  setIsModalOpen(true);
                }}
                className="btn-premium text-xs cursor-pointer w-full sm:w-auto"
              >
                Criar Minha Campanha Agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
