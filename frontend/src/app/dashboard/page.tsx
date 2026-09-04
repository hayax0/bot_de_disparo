"use client";

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/store/useAuth';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api } from '@/lib/api';
import axios from 'axios';
import {
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
  ShieldCheck,
  Clock,
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
  AlertCircle,
  Users,
  Zap,
  Layers,
  Activity,
  Crown,
  CreditCard
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

interface CampaignStats {
  total: number;
  pending: number;
  queued: number;
  sent: number;
  replied: number;
  error: number;
  progress: number;
  estimatedSecondsRemaining: number | null;
}

interface QueueHealth {
  queue: {
    campaignPendingJobs: number;
    orphanedLeads: number;
  };
  globalQueue: {
    waiting: number;
    delayed: number;
    active: number;
    failed: number;
  };
}

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

// Formata segundos em "Xh Ym" legível
function formatEta(seconds: number): string {
  if (seconds < 60) return '<1min';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `~${m}min`;
  return `~${h}h ${m}min`;
}

export default function Dashboard() {
  const { token, user, isHydrated, hydrate, logout } = useAuth();
  const router = useRouter();
  
  const [waStatus, setWaStatus] = useState<{ status: string; qrCode?: string | null } | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, CampaignStats>>({});
  const [queueHealth, setQueueHealth] = useState<QueueHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Ações com feedback de carregamento (evita duplo clique)
  const [connecting, setConnecting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Inicializar hidratação segura do Zustand client-side
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  
  // Modais e Drawers
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
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

  // Carregar campanhas + métricas reais (barra de progresso / ETA)
  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await api.get('/campaigns');
      setCampaigns(res.data);

      const ids: string[] = res.data.map((c: Campaign) => c.id);
      if (ids.length > 0) {
        const results = await Promise.allSettled(
          ids.map(cid => api.get(`/campaigns/${cid}/stats`))
        );
        const map: Record<string, CampaignStats> = {};
        results.forEach((r, idx) => {
          if (r.status === 'fulfilled') map[ids[idx]] = r.value.data;
        });
        setStatsMap(map);
      }
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

    // Polling pausa quando a aba não está visível (economiza VPS e bateria)
    const poll = () => {
      if (document.visibilityState === 'visible') fetchStatus();
    };
    const interval = setInterval(poll, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isHydrated, token, fetchStatus, fetchCampaigns, router]);

  // Polling de stats + saúde da fila enquanto o modal de detalhes estiver aberto
  useEffect(() => {
    if (!selectedCampaignId) return;

    const pollDetails = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const [statsRes, healthRes] = await Promise.allSettled([
          api.get(`/campaigns/${selectedCampaignId}/stats`),
          api.get(`/campaigns/${selectedCampaignId}/queue-health`)
        ]);
        if (statsRes.status === 'fulfilled') {
          setStatsMap(prev => ({ ...prev, [selectedCampaignId]: statsRes.value.data }));
        }
        if (healthRes.status === 'fulfilled') {
          setQueueHealth(healthRes.value.data);
        }
      } catch {
        // silencioso
      }
    };

    pollDetails();
    const interval = setInterval(pollDetails, 10000);
    return () => clearInterval(interval);
  }, [selectedCampaignId]);

  // Tecla ESC para fechar modais
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
        setIsTutorialOpen(false);
        setSelectedCampaignId(null);
        setQueueHealth(null);
        setCampaignToDelete(null);
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleConnect = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      await api.post('/whatsapp/connect');
      addToast('info', 'Inicializando conexão com o WhatsApp...');
      fetchStatus();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && (err.response?.status === 403 || err.response?.data?.code === 'SUBSCRIPTION_REQUIRED')) {
        setIsSubscriptionModalOpen(true);
      }
      let msg = 'Erro ao conectar WhatsApp.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (connecting) return;
    setConnecting(true);
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
    } finally {
      setConnecting(false);
    }
  };

  // Carregar detalhes dos leads da campanha
  const openCampaignDetails = async (campaignId: string) => {
    setQueueHealth(null);
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
      setQueueHealth(null);
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
    let createdCampaignId: string | null = null;
    try {
      // 1. Criar campanha
      const res = await api.post('/campaigns', {
        name: newCampaign.name,
        messageComSite: newCampaign.messageComSite.trim() || null,
        messageSemSite: newCampaign.messageSemSite.trim() || null,
        delayMin: newCampaign.delayMin,
        delayMax: newCampaign.delayMax
      });
      createdCampaignId = res.data.id;

      // 2. Upload leads
      const formData = new FormData();
      formData.append('file', newCampaign.file);
      const importRes = await api.post(`/campaigns/${createdCampaignId}/leads/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      addToast('success', `Campanha criada! ${importRes.data.imported} leads importados (${importRes.data.skipped} ignorados/duplicados).`);
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
      if (axios.isAxiosError(err) && (err.response?.status === 403 || err.response?.data?.code === 'SUBSCRIPTION_REQUIRED')) {
        setIsSubscriptionModalOpen(true);
      }
      // Se a campanha foi criada mas o upload de leads falhou, remove a campanha vazia órfã
      if (createdCampaignId) {
        try {
          await api.delete(`/campaigns/${createdCampaignId}`);
        } catch {
          // limpeza silenciosa
        }
      }
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
    if (actionLoading) return;
    setActionLoading(id);
    try {
      const res = await api.post(`/campaigns/${id}/start`);
      addToast('success', res.data.message || 'Campanha iniciada com sucesso!');
      fetchCampaigns();
      if (selectedCampaignId === id) openCampaignDetails(id);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && (err.response?.status === 403 || err.response?.data?.code === 'SUBSCRIPTION_REQUIRED')) {
        setIsSubscriptionModalOpen(true);
      }
      let msg = 'Erro ao iniciar campanha.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async (id: string) => {
    if (actionLoading) return;
    setActionLoading(id);
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
    } finally {
      setActionLoading(null);
    }
  };

  const confirmDelete = async () => {
    if (!campaignToDelete || actionLoading) return;
    setActionLoading(campaignToDelete.id);
    try {
      await api.delete(`/campaigns/${campaignToDelete.id}`);
      addToast('success', 'Campanha excluída com sucesso.');
      setCampaignToDelete(null);
      if (selectedCampaignId === campaignToDelete.id) {
        setSelectedCampaignId(null);
        setQueueHealth(null);
      }
      fetchCampaigns();
    } catch (err: unknown) {
      let msg = 'Erro ao excluir campanha.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    } finally {
      setActionLoading(null);
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

  // Cálculos de métricas globais
  const totalLeadsGlobal = useMemo(() => {
    return campaigns.reduce((acc, c) => acc + (c._count?.leads || 0), 0);
  }, [campaigns]);

  return (
    <div className="min-h-screen bg-[#08090D] text-slate-100 flex flex-col md:flex-row relative selection:bg-purple-500/30 selection:text-purple-200">
      
      {/* Luz ambiente difusa no topo */}
      <div className="glow-ambient" />

      {/* Barra de Notificações Toast */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full px-3">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={`pointer-events-auto p-3.5 rounded-2xl text-xs font-medium backdrop-blur-2xl shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-bottom-2 border ${
              t.type === 'success' ? 'bg-emerald-950/80 text-emerald-200 border-emerald-500/30' : 
              t.type === 'error' ? 'bg-red-950/80 text-red-200 border-red-500/30' : 
              'bg-purple-950/80 text-purple-200 border-purple-500/30'
            }`}
          >
            {t.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
            {t.type === 'error' && <AlertCircle size={16} className="text-red-400 shrink-0" />}
            {t.type === 'info' && <Info size={16} className="text-purple-400 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Header Mobile Minimalista */}
      <header className="md:hidden flex items-center justify-between p-4 glass-panel border-b border-white/[0.06] sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl overflow-hidden shadow-md shadow-purple-500/20 border border-purple-500/30">
            <Image src="/logo.png" alt="Logo" width={32} height={32} priority className="w-full h-full object-cover" />
          </div>
          <span className="font-bold text-sm tracking-tight text-white">Disparador</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          aria-label="Abrir menu"
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Sidebar Desktop Minimalista e Translúcida */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 glass-panel border-r border-white/[0.06] flex flex-col justify-between p-5 transition-transform duration-300 md:translate-x-0 md:static
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8 px-2">
            <div className="w-9 h-9 rounded-2xl overflow-hidden shadow-lg shadow-purple-500/25 border border-purple-500/30">
              <Image src="/logo.png" alt="Logo" width={36} height={36} priority className="w-full h-full object-cover" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white block">Disparador</span>
              <span className="text-[10px] text-purple-400 font-mono">PROSPECTOR SAAS</span>
            </div>
          </div>

          {/* Navegação */}
          <nav className="space-y-1.5">
            <div className="px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white flex items-center gap-3 text-xs font-semibold shadow-inner">
              <Activity size={16} className="text-purple-400" />
              <span>Painel Geral</span>
            </div>
            <button
              onClick={() => setIsTutorialOpen(true)}
              className="w-full px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.03] transition-colors flex items-center gap-3 text-xs font-medium text-left cursor-pointer"
            >
              <BookOpen size={16} className="text-slate-500" />
              <span>Tutorial Apify</span>
            </button>
          </nav>
        </div>

        {/* Perfil & Logout */}
        <div className="pt-4 border-t border-white/[0.06] space-y-3">
          <div className="px-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono block mb-1">CONTA</span>
            <div className="flex items-center justify-between gap-1">
              <p className="text-xs font-semibold text-slate-200 truncate">{user?.name || user?.email}</p>
              {user?.role === 'ADMIN' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-300 text-[10px] font-bold shrink-0">
                  <Crown size={10} className="text-purple-400" />
                  VIP
                </span>
              ) : user?.subscriptionStatus === 'ACTIVE' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold shrink-0">
                  <CheckCircle2 size={10} className="text-emerald-400" />
                  Ativo
                </span>
              ) : (
                <button
                  onClick={() => setIsSubscriptionModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-semibold shrink-0 hover:bg-amber-500/20 cursor-pointer"
                >
                  <AlertTriangle size={10} className="text-amber-400" />
                  Renovar
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400 truncate font-mono mt-0.5">{user?.email}</p>
          </div>
          <button 
            onClick={() => {
              logout();
              router.push('/login');
            }} 
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
          >
            <LogOut size={14} />
            <span>Encerrar Sessão</span>
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 relative z-10">
        
        {/* Banner de Assinatura Inativa / Vencida */}
        {user?.role !== 'ADMIN' && user?.subscriptionStatus !== 'ACTIVE' && (
          <div className="glass-panel rounded-2xl p-4 border border-amber-500/30 bg-amber-500/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <CreditCard size={18} />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-white">Sua assinatura está inativa ou expirada</h3>
                <p className="text-[11px] text-slate-400">Ative seu plano para liberar a conexão do WhatsApp, importação de leads e disparos.</p>
              </div>
            </div>
            <a
              href="https://pay.cakto.com.br/at474et_1080517"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary-dark px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <Zap size={14} />
              <span>Assinar Plano Mensal</span>
            </a>
          </div>
        )}

        {/* Top Header com Botão de Ação */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Visão Geral</h1>
            <p className="text-xs text-slate-400 mt-1">Gerencie suas campanhas de prospecção com automação e segurança anti-bloqueio.</p>
          </div>
          <div className="flex items-center gap-2.5">
            <button 
              onClick={() => setIsTutorialOpen(true)}
              className="btn-secondary-dark px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <HelpCircle size={14} className="text-purple-400" />
              <span>Como extrair leads</span>
            </button>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="btn-primary-dark px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={15} />
              <span>Nova Campanha</span>
            </button>
          </div>
        </div>

        {/* Status do WhatsApp Minimalista com LED Neon */}
        <section className="glass-panel rounded-3xl p-5 border border-white/[0.08] relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                waStatus?.status === 'CONNECTED' 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.2)]' 
                  : waStatus?.status === 'QRCODE'
                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                  : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
              }`}>
                <Smartphone size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-sm sm:text-base text-white">WhatsApp de Disparo</h2>
                  <span className="relative flex h-2 w-2">
                    {waStatus?.status === 'CONNECTED' && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${
                      waStatus?.status === 'CONNECTED' ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 
                      waStatus?.status === 'QRCODE' ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'
                    }`}></span>
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {waStatus?.status === 'CONNECTED' 
                    ? 'Conexão ativa e segura na VPS com simulação humana' 
                    : waStatus?.status === 'QRCODE' 
                    ? 'Aguardando leitura do QR Code no aplicativo' 
                    : 'Nenhum número pareado no momento'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {waStatus?.status === 'DISCONNECTED' && (
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="btn-primary-dark px-4 py-2 rounded-xl text-xs cursor-pointer flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {connecting ? <RefreshCw size={15} className="animate-spin" /> : <QrCode size={15} />}
                  <span>{connecting ? 'Iniciando...' : 'Conectar WhatsApp'}</span>
                </button>
              )}
              {waStatus?.status === 'QRCODE' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="btn-secondary-dark px-3 py-1.5 rounded-xl text-xs cursor-pointer text-purple-300 border-purple-500/30 hover:bg-purple-500/10 disabled:opacity-60 flex items-center gap-1.5"
                  >
                    {connecting && <RefreshCw size={12} className="animate-spin" />}
                    🔄 Atualizar QR
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={connecting}
                    className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors cursor-pointer disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                </div>
              )}
              {waStatus?.status === 'CONNECTED' && (
                <button
                  onClick={handleDisconnect}
                  disabled={connecting}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                >
                  {connecting && <RefreshCw size={12} className="animate-spin" />}
                  {connecting ? 'Desconectando...' : 'Desconectar'}
                </button>
              )}
            </div>
          </div>

          {/* Exibição do QR Code quando ativo */}
          {waStatus?.status === 'QRCODE' && waStatus.qrCode && (
            <div className="mt-5 pt-5 border-t border-white/[0.06] flex flex-col items-center justify-center animate-in fade-in">
              <div className="p-3 bg-white rounded-2xl shadow-2xl border border-white/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={waStatus.qrCode} 
                  alt="QR Code WhatsApp" 
                  className="w-48 h-48 sm:w-56 sm:h-56 rounded-xl object-contain"
                />
              </div>
              <p className="text-xs text-slate-400 mt-3 text-center">
                Abra o WhatsApp no celular ➔ <b>Aparelhos Conectados</b> ➔ <b>Conectar um aparelho</b> e aponte a câmera.
              </p>
            </div>
          )}
        </section>

        {/* Cards de Métricas (KPIs Globais) */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          <div className="glass-card rounded-2xl p-4 border border-white/[0.07]">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Campanhas</span>
              <Layers size={15} className="text-purple-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">{campaigns.length}</div>
            <div className="text-[10px] text-slate-500 mt-1 font-mono">Configuradas na conta</div>
          </div>

          <div className="glass-card rounded-2xl p-4 border border-white/[0.07]">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Total Leads</span>
              <Users size={15} className="text-indigo-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">{totalLeadsGlobal}</div>
            <div className="text-[10px] text-slate-500 mt-1 font-mono">Importados do Apify</div>
          </div>

          <div className="glass-card rounded-2xl p-4 border border-white/[0.07]">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Anti-Bloqueio</span>
              <ShieldCheck size={15} className="text-emerald-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-400">Ativo</div>
            <div className="text-[10px] text-slate-500 mt-1 font-mono">Delays + Pausas de lote</div>
          </div>

          <div className="glass-card rounded-2xl p-4 border border-white/[0.07]">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Servidor VPS</span>
              <Zap size={15} className="text-amber-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-amber-400">24/7 Online</div>
            <div className="text-[10px] text-slate-500 mt-1 font-mono">Execução em background</div>
          </div>
        </section>

        {/* Lista de Campanhas */}
        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Minhas Campanhas</h2>
            <span className="text-xs text-slate-500 font-mono">{campaigns.length} total</span>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-3.5" aria-busy="true" aria-label="Carregando campanhas">
              {[0, 1, 2].map(i => (
                <div key={i} className="glass-card rounded-2xl p-4 sm:p-5 border border-white/[0.07] animate-pulse">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-2.5 flex-1">
                      <div className="h-4 w-2/5 rounded-lg bg-white/[0.08]" />
                      <div className="h-3 w-1/3 rounded-lg bg-white/[0.05]" />
                      <div className="h-1.5 w-full rounded-full bg-white/[0.06]" />
                    </div>
                    <div className="flex gap-2">
                      <div className="h-8 w-8 rounded-xl bg-white/[0.06]" />
                      <div className="h-8 w-20 rounded-xl bg-white/[0.06]" />
                      <div className="h-8 w-8 rounded-xl bg-white/[0.06]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="glass-panel rounded-3xl p-10 sm:p-14 text-center border border-dashed border-white/[0.1] flex flex-col items-center">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-4">
                <FileJson size={24} />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Nenhuma campanha criada ainda</h3>
              <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
                Extraia seus leads no Google Maps Scraper (Apify), crie sua campanha e comece a disparar no automático.
              </p>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="btn-primary-dark px-5 py-2.5 rounded-xl text-xs cursor-pointer flex items-center gap-2"
              >
                <Plus size={15} />
                <span>Criar Primeira Campanha</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5">
              {campaigns.map(camp => (
                <div 
                  key={camp.id} 
                  className="glass-card rounded-2xl p-4 sm:p-5 border border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-bold text-sm sm:text-base text-white">{camp.name}</h3>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider ${
                        camp.status === 'RUNNING' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 animate-pulse' 
                          : camp.status === 'COMPLETED'
                          ? 'bg-purple-500/10 text-purple-300 border border-purple-500/30'
                          : 'bg-white/[0.05] text-slate-400 border border-white/[0.1]'
                      }`}>
                        {camp.status === 'RUNNING' ? 'EM EXECUÇÃO' : camp.status === 'COMPLETED' ? 'CONCLUÍDA' : 'PAUSADA'}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Users size={13} className="text-slate-500" />
                        <b>{camp._count?.leads || 0}</b> leads
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={13} className="text-slate-500" />
                        Delay: <b>{camp.delayMin}s - {camp.delayMax}s</b>
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {new Date(camp.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>

                    {/* Barra de progresso real (derivada dos status dos leads no banco) */}
                    {statsMap[camp.id] && statsMap[camp.id].total > 0 && (statsMap[camp.id].progress > 0 || camp.status === 'RUNNING') && (
                      <div className="pt-1 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-slate-400">
                            <span className="text-emerald-400">{statsMap[camp.id].sent + statsMap[camp.id].replied}</span>
                            {' '}enviados
                            {statsMap[camp.id].replied > 0 && (
                              <> · <span className="text-purple-400">{statsMap[camp.id].replied}</span> respostas</>
                            )}
                            {statsMap[camp.id].error > 0 && (
                              <> · <span className="text-red-400">{statsMap[camp.id].error}</span> erros</>
                            )}
                          </span>
                          <span className="text-slate-500">
                            {statsMap[camp.id].progress}%
                            {camp.status === 'RUNNING' && statsMap[camp.id].estimatedSecondsRemaining !== null && (
                              <> · restam {formatEta(statsMap[camp.id].estimatedSecondsRemaining!)}</>
                            )}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              camp.status === 'RUNNING' ? 'bg-gradient-to-r from-purple-500 to-emerald-400' : 'bg-purple-500/60'
                            }`}
                            style={{ width: `${statsMap[camp.id].progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {camp.status === 'RUNNING' ? (
                      <button
                        onClick={() => handlePause(camp.id)}
                        disabled={actionLoading === camp.id}
                        className="p-2 rounded-xl text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Pausar Campanha"
                      >
                        {actionLoading === camp.id ? <RefreshCw size={16} className="animate-spin" /> : <Pause size={16} />}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStart(camp.id)}
                        disabled={waStatus?.status !== 'CONNECTED' || actionLoading === camp.id}
                        className="btn-primary-dark p-2 rounded-xl text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title={waStatus?.status !== 'CONNECTED' ? 'Conecte o WhatsApp para iniciar' : 'Iniciar Campanha'}
                      >
                        {actionLoading === camp.id ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
                      </button>
                    )}

                    <button 
                      onClick={() => openCampaignDetails(camp.id)}
                      className="btn-secondary-dark px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye size={14} />
                      <span>Ver Leads</span>
                    </button>

                    <button 
                      onClick={() => setCampaignToDelete(camp)}
                      className="p-2 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Excluir Campanha"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>

      {/* Modal: Nova Campanha (Dark Glassmorphism) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel bg-[#0B0D14]/95 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">Criar Nova Campanha</h2>
                <p className="text-xs text-slate-400 mt-0.5">Importe seus leads e configure suas mensagens inteligentes.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="p-5 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 flex-1">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Nome da Campanha</label>
                <input 
                  type="text" 
                  required
                  autoFocus
                  value={newCampaign.name}
                  onChange={e => setNewCampaign({...newCampaign, name: e.target.value})}
                  className="block w-full px-3.5 py-2.5 glass-input rounded-xl text-sm"
                  placeholder="Ex: Clínicas Odontológicas - São Paulo"
                />
              </div>

              {/* Upload de Arquivo */}
              <div className="glass-card p-4 rounded-2xl border border-white/[0.08]">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Arquivo de Leads (.JSON ou .CSV)
                  </label>
                  <button 
                    type="button" 
                    onClick={() => setIsTutorialOpen(true)}
                    className="text-xs text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <HelpCircle size={13} /> Como gerar?
                  </button>
                </div>
                <input 
                  type="file" 
                  accept=".json,.csv,text/csv,application/json"
                  required
                  onChange={e => setNewCampaign({...newCampaign, file: e.target.files ? e.target.files[0] : null})}
                  className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 file:transition-colors cursor-pointer"
                />
                <p className="text-[10px] text-slate-500 mt-2 font-mono">
                  Aceita arquivos .JSON do Apify Google Maps Scraper ou planilhas .CSV.
                </p>
              </div>

              {/* Sugestões de Copys de Alta Conversão */}
              <div className="glass-card p-4 rounded-2xl border border-purple-500/20 bg-purple-950/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                    💡 Sugestões de Copys Validadas
                  </span>
                  <span className="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                    Clique para Inserir
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mb-3">
                  Escreva seu próprio texto ou use uma das copys validadas abaixo:
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCampaign({
                      ...newCampaign,
                      messageSemSite: defaultSemSite,
                      messageComSite: defaultComSite
                    })}
                    className="px-2.5 py-1.5 bg-white/[0.06] hover:bg-purple-600/30 border border-white/10 hover:border-purple-500/40 text-purple-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                  >
                    🚀 Kit Completo (Com e Sem Site)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCampaign({ ...newCampaign, messageSemSite: defaultSemSite })}
                    className="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 rounded-xl text-xs transition-all cursor-pointer"
                  >
                    ✨ Venda de Site (Sem Site)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCampaign({ ...newCampaign, messageComSite: defaultComSite })}
                    className="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 rounded-xl text-xs transition-all cursor-pointer"
                  >
                    🎯 Triagem WhatsApp (Com Site)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCampaign({ ...newCampaign, messageSemSite: defaultB2B })}
                    className="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 rounded-xl text-xs transition-all cursor-pointer"
                  >
                    💼 Prospecção B2B Direta
                  </button>
                </div>
              </div>

              {/* Delays */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Delay Mínimo (segundos)</label>
                  <input 
                    type="number" 
                    required
                    min={10}
                    value={newCampaign.delayMin}
                    onChange={e => setNewCampaign({...newCampaign, delayMin: Number(e.target.value)})}
                    className="block w-full px-3.5 py-2.5 glass-input rounded-xl text-sm"
                  />
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">Recomendado: 90s</p>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Delay Máximo (segundos)</label>
                  <input 
                    type="number" 
                    required
                    min={10}
                    value={newCampaign.delayMax}
                    onChange={e => setNewCampaign({...newCampaign, delayMax: Number(e.target.value)})}
                    className="block w-full px-3.5 py-2.5 glass-input rounded-xl text-sm"
                  />
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">Recomendado: 180s</p>
                </div>
              </div>

              {/* Mensagem Principal / Sem Site */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Mensagem Principal <span className="text-purple-400 font-bold">(Para Sem Site ou Geral)</span>
                  </label>
                  <span className="text-[10px] text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                    {newCampaign.messageComSite.trim() ? 'Leads Sem Site' : 'Enviada para Todos'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1 text-[11px] py-1">
                  <span className="text-slate-500 text-[10px] mr-1">Inserir:</span>
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
                      className="px-1.5 py-0.5 bg-white/[0.05] hover:bg-purple-500/20 hover:text-purple-300 border border-white/[0.08] rounded text-[10px] font-mono text-slate-300 transition-colors cursor-pointer"
                    >
                      +{item.label}
                    </button>
                  ))}
                </div>

                <textarea 
                  rows={4}
                  value={newCampaign.messageSemSite}
                  onChange={e => setNewCampaign({...newCampaign, messageSemSite: e.target.value})}
                  className="block w-full px-3.5 py-2.5 glass-input rounded-xl text-xs sm:text-sm font-sans"
                  placeholder="Escreva sua mensagem personalizada ou clique em um dos modelos acima..."
                />
              </div>

              {/* Mensagem Opcional Com Site */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Mensagem Específica para quem <span className="text-emerald-400 font-bold">TEM SITE PRÓPRIO</span>
                  </label>
                  <span className="text-[10px] text-slate-400 bg-white/[0.05] px-2 py-0.5 rounded border border-white/[0.08]">
                    Opcional
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1 text-[11px] py-1">
                  <span className="text-slate-500 text-[10px] mr-1">Inserir:</span>
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
                      className="px-1.5 py-0.5 bg-white/[0.05] hover:bg-emerald-500/20 hover:text-emerald-300 border border-white/[0.08] rounded text-[10px] font-mono text-slate-300 transition-colors cursor-pointer"
                    >
                      +{item.label}
                    </button>
                  ))}
                </div>

                <textarea 
                  rows={4}
                  value={newCampaign.messageComSite}
                  onChange={e => setNewCampaign({...newCampaign, messageComSite: e.target.value})}
                  className="block w-full px-3.5 py-2.5 glass-input rounded-xl text-xs sm:text-sm font-sans"
                  placeholder="Se deixar em branco, o robô enviará a mensagem principal para todos os leads..."
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-white/[0.08]">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="btn-secondary-dark px-4 py-2 rounded-xl text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="btn-primary-dark px-5 py-2 rounded-xl text-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Importando Leads...' : 'Criar e Importar Lista'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Detalhes dos Leads da Campanha */}
      {selectedCampaignId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel bg-[#0B0D14]/95 border border-white/10 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">{campaignDetails?.campaign.name || 'Detalhes da Campanha'}</h2>
                <p className="text-xs text-slate-400 mt-0.5">Acompanhamento em tempo real de disparos e respostas.</p>
              </div>
              <button
                onClick={() => { setSelectedCampaignId(null); setQueueHealth(null); }}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {isLoadingDetails ? (
              <div className="p-5 sm:p-6 space-y-4 animate-pulse" aria-busy="true" aria-label="Carregando leads">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="glass-card p-3 rounded-xl border border-white/[0.08]">
                      <div className="h-2.5 w-16 rounded bg-white/[0.08]" />
                      <div className="h-6 w-10 rounded bg-white/[0.08] mt-2" />
                    </div>
                  ))}
                </div>
                <div className="h-9 rounded-xl bg-white/[0.06]" />
                <div className="space-y-2">
                  {[0, 1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-9 rounded-lg bg-white/[0.05]" />
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
                
                {/* KPIs da Campanha */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="glass-card p-3 rounded-xl border border-white/[0.08]">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Pendentes</span>
                    <p className="text-lg font-bold text-amber-400 mt-0.5">{campaignDetails?.counts.pending || 0}</p>
                  </div>
                  <div className="glass-card p-3 rounded-xl border border-white/[0.08]">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Enviados</span>
                    <p className="text-lg font-bold text-emerald-400 mt-0.5">{campaignDetails?.counts.sent || 0}</p>
                  </div>
                  <div className="glass-card p-3 rounded-xl border border-white/[0.08]">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Respondidos</span>
                    <p className="text-lg font-bold text-purple-400 mt-0.5">{campaignDetails?.counts.replied || 0}</p>
                  </div>
                  <div className="glass-card p-3 rounded-xl border border-white/[0.08]">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Erros</span>
                    <p className="text-lg font-bold text-red-400 mt-0.5">{campaignDetails?.counts.error || 0}</p>
                  </div>
                </div>

                {/* Alerta de leads órfãos (QUEUED sem job na fila) */}
                {queueHealth && queueHealth.queue.orphanedLeads > 0 && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    <span>
                      <b>{queueHealth.queue.orphanedLeads} lead(s)</b> ficaram marcados como &quot;na fila&quot; mas sem job correspondente.
                      Pausar e iniciar a campanha novamente re-enfileira tudo de forma segura (sem duplicar envios).
                    </span>
                  </div>
                )}

                {/* Filtros e Busca */}
                <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between pt-2">
                  <div className="relative w-full sm:w-64">
                    <Search size={14} className="absolute left-3 top-3 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Buscar lead ou telefone..."
                      value={leadSearchTerm}
                      onChange={e => setLeadSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs glass-input rounded-xl"
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
                            ? 'bg-purple-600 text-white' 
                            : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08]'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tabela de Leads Dark Minimalista */}
                <div className="glass-card rounded-2xl border border-white/[0.08] overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-white/[0.03] border-b border-white/[0.08] text-slate-400 font-semibold">
                        <tr>
                          <th className="p-3">Empresa</th>
                          <th className="p-3">Telefone</th>
                          <th className="p-3">Site / Bairro</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Envio / Detalhes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {filteredLeads.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-slate-500">
                              Nenhum lead encontrado com os filtros atuais.
                            </td>
                          </tr>
                        ) : (
                          filteredLeads.map(lead => (
                            <tr key={lead.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="p-3 font-semibold text-slate-200 max-w-[180px] truncate">{lead.title}</td>
                              <td className="p-3 text-slate-400 font-mono whitespace-nowrap">{lead.phone}</td>
                              <td className="p-3 text-slate-400 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  {lead.website ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-medium border border-emerald-500/20">
                                      <Globe size={11} /> Site
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 text-[11px]">Sem site</span>
                                  )}
                                  {lead.neighborhood && (
                                    <span className="inline-flex items-center gap-0.5 text-slate-400 text-[11px] truncate max-w-[120px]">
                                      <MapPin size={11} className="text-slate-500" /> {lead.neighborhood}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 whitespace-nowrap">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold text-[10px] ${
                                  lead.status === 'SENT'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : lead.status === 'PENDING'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : lead.status === 'REPLIED'
                                    ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                }`}>
                                  {lead.status === 'SENT' && <Check size={11} />}
                                  {lead.status === 'PENDING' && <Clock size={11} />}
                                  {lead.status === 'ERROR' && <AlertCircle size={11} />}
                                  {lead.status}
                                </span>
                              </td>
                              <td
                                className="p-3 text-slate-500 text-[11px] max-w-[200px] truncate font-mono"
                                title={lead.errorMessage || undefined}
                              >
                                {lead.sentAt
                                  ? new Date(lead.sentAt).toLocaleString('pt-BR')
                                  : lead.status === 'ERROR'
                                    ? <span className="text-red-400/90">{lead.errorMessage || 'Falha desconhecida'}</span>
                                    : (lead.errorMessage || '—')}
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

            <div className="p-4 border-t border-white/[0.08] flex justify-end">
              <button
                onClick={() => { setSelectedCampaignId(null); setQueueHealth(null); }}
                className="btn-secondary-dark px-4 py-2 rounded-xl text-xs cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tutorial Apify (Dark Glassmorphism) */}
      {isTutorialOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel bg-[#0B0D14]/95 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
                  <BookOpen size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Como Extrair Leads no Apify</h2>
                  <p className="text-xs text-slate-400">Gere sua lista de contatos do Google Maps em 3 minutos.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsTutorialOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 text-xs text-slate-300">
              
              <div className="flex gap-3.5">
                <div className="w-6 h-6 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-white text-sm">Acesse o Apify e abra o Scraper</h3>
                  <p className="text-slate-400 leading-relaxed">
                    Acesse <a href="https://apify.com" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline inline-flex items-center gap-0.5">apify.com <ExternalLink size={11} /></a> (crie conta gratuita com $5). No Store, procure por <b>&quot;Google Maps Scraper&quot;</b>.
                  </p>
                </div>
              </div>

              <div className="flex gap-3.5">
                <div className="w-6 h-6 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-white text-sm">Defina o Nicho e a Região</h3>
                  <p className="text-slate-400 leading-relaxed">
                    No campo <b>Search Strings</b>, digite os nichos desejados (ex: <i>&quot;Dentistas em Curitiba&quot;</i>).
                  </p>
                </div>
              </div>

              <div className="flex gap-3.5">
                <div className="w-6 h-6 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-white text-sm">Exporte em .JSON ou .CSV</h3>
                  <p className="text-slate-400 leading-relaxed">
                    Ao concluir, clique em <b>Export Results</b> e selecione o formato <b>JSON</b> ou <b>CSV</b>.
                  </p>
                </div>
              </div>

            </div>

            <div className="p-4 border-t border-white/[0.08] flex justify-end">
              <button 
                onClick={() => setIsTutorialOpen(false)}
                className="btn-primary-dark px-4 py-2 rounded-xl text-xs cursor-pointer"
              >
                Entendi, fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Exclusão */}
      {campaignToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel bg-[#0B0D14]/95 border border-red-500/20 rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Excluir Campanha</h3>
                <p className="text-xs text-slate-400 font-mono">Esta ação não pode ser desfeita.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-6 leading-relaxed">
              Tem certeza que deseja excluir a campanha <b>&quot;{campaignToDelete.name}&quot;</b>? Todos os leads associados serão removidos.
            </p>

            <div className="flex justify-end gap-2.5">
              <button 
                onClick={() => setCampaignToDelete(null)}
                className="btn-secondary-dark px-4 py-2 rounded-xl text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={actionLoading === campaignToDelete.id}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer shadow-lg shadow-red-600/30 disabled:opacity-60 flex items-center gap-2"
              >
                {actionLoading === campaignToDelete.id && <RefreshCw size={13} className="animate-spin" />}
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Assinatura Necessária / Cakto */}
      {isSubscriptionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel bg-[#0B0D14]/95 border border-purple-500/30 rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 relative">
            <button 
              onClick={() => setIsSubscriptionModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 text-purple-400 flex items-center justify-center shadow-lg shadow-purple-500/10">
                <Crown size={24} />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Ativação de Assinatura</h3>
                <p className="text-xs text-slate-400">Acesso ilimitado à plataforma de disparos</p>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                  <span>Disparos inteligentes com delay anti-bloqueio</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                  <span>Importação direta de leads do Google Maps / Apify</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                  <span>Motor de Spintax e personalização por lead</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                  <span>Execução 24/7 em segundo plano na nuvem</span>
                </div>
              </div>

              <div className="text-center p-3 rounded-2xl bg-purple-500/[0.07] border border-purple-500/20">
                <span className="text-[11px] text-purple-300 font-medium block">Plano Mensal Recorrente</span>
                <div className="text-2xl font-bold text-white mt-0.5">R$ 145,99 <span className="text-xs font-normal text-slate-400">/mês</span></div>
                <span className="text-[10px] text-slate-400 block mt-1">Liberação instantânea via PIX ou Cartão</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <a
                href="https://pay.cakto.com.br/at474et_1080517"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-2xl text-xs transition-all shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Zap size={15} />
                <span>Assinar Agora na Cakto</span>
              </a>
              <button 
                onClick={() => setIsSubscriptionModalOpen(false)}
                className="w-full py-2.5 text-slate-400 hover:text-white text-xs font-medium transition-colors cursor-pointer"
              >
                Talvez mais tarde
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
