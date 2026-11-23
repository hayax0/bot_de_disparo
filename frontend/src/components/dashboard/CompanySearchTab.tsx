"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { ApifyConnection } from "./ApifyConnection";
import { SearchLiveMap, type SearchMapPoint } from "./SearchLiveMap";
import { api } from "@/lib/api";
import {
  Search,
  MapPin,
  Building2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Phone,
  Star,
  Layers,
  Plus,
  Coins,
  HelpCircle,
  ExternalLink
} from "lucide-react";

interface CompanySearchResultItem {
  id: string;
  name: string;
  phone: string | null;
  website: string | null;
  hasWebsite: boolean;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  category: string | null;
  rating: number | null;
  reviewsCount: number | null;
  isUsable: boolean;
  discardReason: string | null;
  importedLeadId?: string | null;
}

interface SearchHistorySummary {
  id: string;
  query: string;
  segment: string;
  location: string;
  requestedCount: number;
  websiteFilter?: string;
  foundCount: number;
  usableCount: number;
  discardedCount: number;
  creditsConsumed: number;
  status: string;
  createdAt: string;
  _count?: { results: number };
}

interface CampaignOption {
  id: string;
  name: string;
  status: string;
}

function readableSearchFailure(errorMessage?: string | null) {
  const message = errorMessage?.trim();
  if (!message) return 'Não foi possível concluir esta busca. Você pode tentar novamente.';
  if (
    message.length > 260 ||
    /Invalid `prisma\.|Unknown argument|invocation|node_modules|\/Users\//i.test(message)
  ) {
    return 'Esta tentativa falhou por um erro técnico de uma execução anterior. Inicie uma nova busca para tentar novamente.';
  }
  return message;
}

export interface SearchCampaignSelection {
  searchId: string;
  resultIds: string[];
  query: string;
  withWebsite: number;
  withoutWebsite: number;
}

interface CompanySearchTabProps {
  campaigns: CampaignOption[];
  onOpenCreateCampaignWithLeads?: (selection: SearchCampaignSelection) => void;
  onRefreshCampaigns?: () => void;
  addToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export function CompanySearchTab({
  campaigns,
  onOpenCreateCampaignWithLeads,
  onRefreshCampaigns,
  addToast
}: CompanySearchTabProps) {
  const websiteFilterLabel = (filter?: string) => filter === 'WITH_WEBSITE' ? 'Com site próprio' : filter === 'WITHOUT_WEBSITE' ? 'Sem site próprio' : 'Todos os sites';
  const [suggestions, setSuggestions] = useState<Array<{ id: string; segment: string; websiteFilter: string; reason: string }>>([]);
  const [suggestionsError, setSuggestionsError] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [profileCompleted, setProfileCompleted] = useState(false);
  const [appliedSuggestion, setAppliedSuggestion] = useState('');
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      setSuggestionsLoading(true);
      api.get('/profile/prospecting-suggestions').then(({ data }) => {
        if (!mounted) return;
        setSuggestions(data.suggestions || []); setProfileCompleted(data.profileCompleted); setSuggestionsError(false);
      }).catch(() => { if (mounted) setSuggestionsError(true); })
        .finally(() => { if (mounted) setSuggestionsLoading(false); });
    };
    refresh(); window.addEventListener('professional-profile:updated', refresh);
    return () => { mounted = false; window.removeEventListener('professional-profile:updated', refresh); };
  }, []);
  const [apifyReady, setApifyReady] = useState(false);
  // Parâmetros de Busca
  const [segment, setSegment] = useState("");
  const [location, setLocation] = useState("");
  const [requestedCount, setRequestedCount] = useState<number>(20);
  
  const [websiteFilter, setWebsiteFilter] = useState("ALL");

  // Estados de Execução
  const [isSearching, setIsSearching] = useState(false);
  const [currentSearch, setCurrentSearch] = useState<{
    id: string;
    query: string;
    segment?: string;
    location?: string;
    requestedCount?: number;
    status: string;
    errorMessage?: string | null;
    websiteFilter?: string;
    foundCount: number;
    usableCount: number;
    discardedCount: number;
    creditsConsumed: number;
    results: CompanySearchResultItem[];
    mapResults?: SearchMapPoint[];
  } | null>(null);

  // Seleção e Adição à Campanha
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetCampaignId, setTargetCampaignId] = useState<string>("");
  const [isAdding, setIsAdding] = useState(false);

  // Histórico de Buscas
  const [history, setHistory] = useState<SearchHistorySummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get("/search");
      setHistory(res.data || []);
    } catch {
      // silencioso
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Carrega histórico inicial
  useEffect(() => {
    let isMounted = true;
    api.get("/search")
      .then(res => {
        if (isMounted) setHistory(res.data || []);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Chave estável de idempotência para o formulário atual (reutilizada em retry/duplo clique)
  const [searchIdempotencyKey, setSearchIdempotencyKey] = useState<string>(() => `search_cli_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

  const searchInFlight = useRef(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInFlight.current) return;
    if (!apifyReady) { addToast('error', 'Configure a conexão de busca antes de pesquisar.'); return; }
    if (!segment.trim() || !location.trim()) {
      addToast('error', 'Informe o segmento e a localização desejada.');
      return;
    }

    searchInFlight.current = true;
    setIsSearching(true);
    setSelectedIds(new Set());

    try {
      const res = await api.post("/search", {
        segment: segment.trim(),
        location: location.trim(),
        requestedCount,
        websiteFilter,
        idempotencyKey: searchIdempotencyKey
      });

      let searchData = res.data;
      if (searchData.status === 'COMPLETED') {
        searchData = (await api.get(`/search/${searchData.id}`)).data;
      }
      setCurrentSearch({ ...searchData, results: searchData.results || [], mapResults: searchData.mapResults || [] });

      // Se a busca estiver sendo processada em background pelo worker da fila
      if (searchData.status === 'PENDING' || searchData.status === 'PROCESSING') {
        addToast('info', 'Busca iniciada em segundo plano. Aguardando extração de dados...');
        const pollInterval = 2500;
        const maxAttempts = 120; // até 5 minutos; o worker continua se a espera acabar
        let attempts = 0;

        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          attempts++;
          try {
            const pollRes = await api.get(`/search/${searchData.id}`);
            searchData = pollRes.data;
            setCurrentSearch({ ...searchData, results: searchData.results || [], mapResults: searchData.mapResults || [] });
            if (['COMPLETED', 'FAILED', 'CANCELED'].includes(searchData.status)) {
              break;
            }
          } catch (pollErr: unknown) {
            if (pollErr instanceof Error && !axios.isAxiosError(pollErr)) {
              throw pollErr;
            }
          }
        }
      }

      setCurrentSearch({ ...searchData, results: searchData.results || [], mapResults: searchData.mapResults || [] });

      // Pré-seleciona todos os aproveitáveis automaticamente
      const usableIds = new Set<string>(
        (searchData.results || [])
          .filter((item: CompanySearchResultItem) => item.isUsable)
          .map((item: CompanySearchResultItem) => item.id)
      );
      setSelectedIds(usableIds);

      if (searchData.status === 'FAILED' || searchData.status === 'CANCELED') {
        addToast('error', searchData.errorMessage || 'A busca não foi concluída. Você pode tentar novamente.');
        setSearchIdempotencyKey(crypto.randomUUID());
      } else if (searchData.status !== 'COMPLETED') {
        addToast('info', 'A busca continua em processamento. Consulte o andamento no histórico.');
      }

      if (searchData.status === 'COMPLETED') {
        addToast('success', `Busca concluída! ${searchData.usableCount || 0} empresas aproveitáveis encontradas.`);
        // Gera nova chave para a próxima busca distinta
        setSearchIdempotencyKey(`search_cli_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
      }
      fetchHistory();
    } catch (err: unknown) {
      let code: string | undefined;
      let msg = 'Erro ao realizar busca de empresas.';
      if (err instanceof Error && !axios.isAxiosError(err)) msg = err.message;
      if (axios.isAxiosError(err)) {
        code = err.response?.data?.code;
        msg = err.response?.data?.error || msg;
      }
      if (code === 'INSUFFICIENT_CREDITS') {
        addToast('error', 'Verifique o saldo e as permissões da sua conexão de busca.');
      } else {
        addToast('error', msg);
      }
    } finally {
      searchInFlight.current = false;
      setIsSearching(false);
    }
  };

  const handleOpenHistoricalSearch = async (id: string) => {
    try {
      const res = await api.get(`/search/${id}`);
      setCurrentSearch({ ...res.data, results: res.data.results || [], mapResults: res.data.mapResults || [] });
      const usableIds = new Set<string>(
        (res.data.results || [])
          .filter((item: CompanySearchResultItem) => item.isUsable)
          .map((item: CompanySearchResultItem) => item.id)
      );
      setSelectedIds(usableIds);
    } catch {
      addToast('error', 'Falha ao carregar detalhes da busca histórica.');
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAllUsable = () => {
    if (!currentSearch) return;
    const allUsable = currentSearch.results.filter(r => r.isUsable);
    if (selectedIds.size === allUsable.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allUsable.map(r => r.id)));
    }
  };

  const handleAddToCampaign = async () => {
    if (!currentSearch || !targetCampaignId) {
      addToast('error', 'Selecione uma campanha existente para adicionar as empresas.');
      return;
    }
    if (selectedIds.size === 0) {
      addToast('error', 'Selecione ao menos uma empresa para adicionar.');
      return;
    }

    setIsAdding(true);
    try {
      const res = await api.post(`/search/${currentSearch.id}/add-to-campaign`, {
        campaignId: targetCampaignId,
        companyResultIds: Array.from(selectedIds)
      });

      addToast('success', res.data.message || `${res.data.addedCount} empresas adicionadas à campanha!`);
      if (onRefreshCampaigns) onRefreshCampaigns();
    } catch (err: unknown) {
      let msg = 'Erro ao adicionar empresas à campanha.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    } finally {
      setIsAdding(false);
    }
  };

  const handleCreateNewCampaignFromResults = () => {
    if (!currentSearch || selectedIds.size === 0) {
      addToast('error', 'Selecione ao menos uma empresa aproveitável.');
      return;
    }

    const selected = currentSearch.results.filter(r => selectedIds.has(r.id) && r.isUsable && r.phone);
    onOpenCreateCampaignWithLeads?.({
      searchId: currentSearch.id,
      resultIds: selected.map(r => r.id),
      query: currentSearch.query,
      withWebsite: selected.filter(r => r.hasWebsite).length,
      withoutWebsite: selected.filter(r => !r.hasWebsite).length,
    });
  };

  return (
    <div data-dashboard-reveal className="grid grid-cols-1 xl:grid-cols-[minmax(18rem,0.82fr)_minmax(0,1.18fr)] xl:items-start gap-5">
      {/* Cabeçalho da Seção */}
      <div className="xl:col-span-full flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-white/[0.07]">
        <div>
          <p className="studio-eyebrow">INTELIGÊNCIA COMERCIAL</p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight flex items-center gap-2 mt-1">
            <Building2 className="text-emerald-400" size={23} />
            <span>Encontre seu próximo cliente</span>
          </h2>
          <p className="text-sm text-[var(--studio-muted)] mt-2 max-w-2xl">
            Defina o público e a região. Revise os contatos encontrados e escolha quais entram na sua próxima campanha.
          </p>
        </div>

        <div className="shrink-0 px-3 py-2 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20 flex items-center gap-2 text-xs text-emerald-200">
          <Coins size={14} className="text-emerald-400" />
          <span>Sem consumo de créditos de IA</span>
        </div>
      </div>

      <details open={!apifyReady} className="xl:col-start-1 xl:row-start-2 dash-card rounded-2xl border border-white/[0.08] p-4 group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-white marker:hidden">
          <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${apifyReady ? 'bg-emerald-400' : 'bg-amber-400'}`} /><span>Conexão de busca</span></span>
          <span className="text-xs text-[var(--studio-muted)]">{apifyReady ? 'Conectada · gerenciar' : 'Configurar'}</span>
        </summary>
        <div className="pt-4"><ApifyConnection onConnectionChange={setApifyReady} /></div>
      </details>

      <section aria-label="Sugestões pelo seu perfil" className="xl:col-start-1 xl:row-start-3 dash-card p-5 space-y-4">
        <div><span className="studio-eyebrow">UM PONTO DE PARTIDA PARA PROSPECTAR</span><h3 className="text-lg font-semibold mt-1">Seu serviço. Um público que faz sentido.</h3><p className="text-xs text-[var(--studio-muted)] mt-2">Sugestões gratuitas por regras do seu perfil, sem chamada à IA. Aplicar apenas preenche os campos; você escolhe a cidade e confirma a busca.</p></div>
        {suggestionsLoading ? <p role="status" className="text-xs text-[var(--studio-muted)]">Carregando sugestões…</p> : suggestionsError ? <p role="status" className="text-xs text-amber-300">Sugestões indisponíveis agora. Você pode buscar normalmente preenchendo os campos abaixo.</p> : !profileCompleted ? <p className="text-xs text-[var(--studio-muted)]">Preencha “Meu negócio” em Configurações para receber sugestões.</p> : <div className="grid grid-cols-1 gap-3">{suggestions.map(suggestion => <article key={suggestion.id} className="p-4 rounded-2xl border border-[var(--studio-line)] bg-[var(--studio-bg)] flex flex-col gap-3"><h4 className="text-sm font-semibold break-words">{suggestion.segment}</h4><p className="text-xs text-[var(--studio-muted)] flex-1">{suggestion.reason}</p><p className="text-xs text-[var(--studio-accent)]">{websiteFilterLabel(suggestion.websiteFilter)}</p><button type="button" disabled={isSearching} className="dash-btn-secondary px-3 py-2 text-xs" onClick={() => { setSegment(suggestion.segment); setWebsiteFilter(suggestion.websiteFilter); setSearchIdempotencyKey(crypto.randomUUID()); setAppliedSuggestion(`Sugestão aplicada: ${suggestion.segment}. Confira os filtros, informe a localização e clique em Buscar Empresas quando quiser.`); }}>Aplicar à busca</button></article>)}</div>}
        {appliedSuggestion && <p role="status" className="text-xs text-[var(--studio-accent)]">{appliedSuggestion}</p>}
      </section>
      {/* Formulário de Busca */}
      <div className="xl:col-start-1 xl:row-start-4 dash-card p-5 rounded-2xl border border-white/[0.08] space-y-4">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {/* Segmento */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-[var(--studio-muted)] uppercase tracking-wider">
                Segmento / Nicho
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--studio-muted)]" />
                <input
                  type="text"
                  required
                  placeholder="Ex: Clínicas Odontológicas, Pizzarias"
                  disabled={isSearching}
                  value={segment}
                  onChange={(e) => { setSegment(e.target.value); setSearchIdempotencyKey(crypto.randomUUID()); }}
                  className="w-full pl-9 pr-3.5 py-2.5 dash-input rounded-xl text-xs text-white placeholder-slate-500"
                />
              </div>
            </div>

            {/* Localização */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-[var(--studio-muted)] uppercase tracking-wider">
                Localização / Cidade / Bairro
              </label>
              <div className="relative">
                <MapPin size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--studio-muted)]" />
                <input
                  type="text"
                  required
                  placeholder="Ex.: Rio de Janeiro, RJ ou Moema, São Paulo, SP"
                  disabled={isSearching}
                  value={location}
                  onChange={(e) => { setLocation(e.target.value); setSearchIdempotencyKey(crypto.randomUUID()); }}
                  className="w-full pl-9 pr-3.5 py-2.5 dash-input rounded-xl text-xs text-white placeholder-slate-500"
                />
              </div>
              <p className="text-[10px] leading-relaxed text-[var(--studio-muted)]">Informe cidade e UF para evitar municípios homônimos. Para bairro, use “Bairro, Cidade, UF”.</p>
            </div>

            {/* Quantidade */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-[var(--studio-muted)] uppercase tracking-wider">
                Quantidade Solicitada
              </label>
              <div className="flex items-center gap-1.5">
                {[20, 50, 100].map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    disabled={isSearching}
                    onClick={() => { setRequestedCount(qty); setSearchIdempotencyKey(crypto.randomUUID()); }}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      requestedCount === qty
                        ? "bg-emerald-500 text-slate-950 shadow-sm"
                        : "bg-white/[0.04] text-[var(--studio-muted)] border border-white/[0.08] hover:bg-white/[0.08]"
                    }`}
                  >
                    {qty}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-semibold text-[var(--studio-muted)]">Presença de site</span>
            <div role="group" aria-label="Filtrar empresas pela presença de site" className="grid grid-cols-1 gap-2">
              {[['ALL', 'Qualquer empresa'], ['WITH_WEBSITE', 'Com site próprio'], ['WITHOUT_WEBSITE', 'Sem site próprio']].map(([value, label]) => (
                <button key={value} type="button" disabled={isSearching} aria-pressed={websiteFilter === value}
                  onClick={() => { setWebsiteFilter(value); setSearchIdempotencyKey(crypto.randomUUID()); }}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs transition-colors disabled:opacity-50 ${websiteFilter === value ? 'border-emerald-400/50 bg-emerald-500/[0.09] text-emerald-200' : 'border-white/[0.08] bg-white/[0.02] text-[var(--studio-muted)] hover:bg-white/[0.05]'}`}>
                  <span>{label}</span><span className={`h-3 w-3 rounded-full border ${websiteFilter === value ? 'border-emerald-300 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.4)]' : 'border-white/20'}`} />
                </button>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-[var(--studio-muted)]">Sites de redes sociais não contam como site próprio. Telefones fixos e contatos inválidos são descartados; a busca não confirma que o número tenha WhatsApp.</p>
          </div>

          {/* Rodapé do Formulário: Estimativa e Botão */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-white/[0.06]">
            <div className="flex items-center gap-2 text-[11px] text-[var(--studio-muted)]">
              <HelpCircle size={13} className="text-emerald-400 shrink-0" />
              <span>
                Até <strong>{requestedCount} empresas</strong>. A busca pode ter cobrança pelo serviço conectado, inclusive por dados descartados. <strong>Não utiliza créditos de IA.</strong>
              </span>
            </div>

            <button
              type="submit"
              disabled={isSearching || !apifyReady}
              className="px-5 py-2.5 landing-btn-emerald rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
            >
              {isSearching ? (
                <>
                  <RefreshCw size={14} className="animate-spin text-slate-950" />
                  <span>Extraindo Empresas...</span>
                </>
              ) : (
                <>
                  <Search size={14} />
                  <span>Buscar leads</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <section aria-label="Resultados da busca" className="xl:col-start-2 xl:row-start-2 xl:row-span-3 min-h-[420px] rounded-3xl border border-white/[0.08] bg-[radial-gradient(ellipse_at_70%_12%,rgba(16,185,129,0.10),transparent_42%),linear-gradient(145deg,rgba(13,22,18,0.96),rgba(9,12,12,0.98))] p-4 sm:p-5 overflow-hidden">
      {/* Exibição dos Resultados da Busca Atual */}
      <SearchLiveMap
        key={currentSearch?.id || 'search-preview-map'}
        points={currentSearch?.mapResults || []}
        isSearching={isSearching || currentSearch?.status === 'PENDING' || currentSearch?.status === 'PROCESSING'}
        location={currentSearch?.location || location}
        segment={currentSearch?.segment || segment}
      />
      {!currentSearch && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
          <p className="text-sm font-semibold text-white">Seu mapa de prospecção</p>
          <p className="mt-1 text-xs text-[var(--studio-muted)]">As empresas da Apify serão exibidas aqui, uma a uma, após confirmação da cidade e das coordenadas.</p>
        </div>
      )}
      {currentSearch && currentSearch.status !== 'COMPLETED' && (
        <div role="status" className="dash-card p-5 rounded-2xl border border-white/[0.08] space-y-3">
          <h3 className="font-semibold text-white">{currentSearch.query}</h3>
          <p className="text-sm text-[var(--studio-muted)]">
            {currentSearch.status === 'FAILED'
              ? `Busca falhou. ${readableSearchFailure(currentSearch.errorMessage)}`
            : currentSearch.status === 'CANCELED'
                ? 'Busca cancelada.'
                : `${currentSearch.mapResults?.length || 0} empresa(s) local(is) já apareceram no mapa. Validando os próximos resultados.`}
          </p>
          {currentSearch.status === 'FAILED' ? (
            <button type="button" onClick={() => {
              setSegment(currentSearch.segment || '');
              setLocation(currentSearch.location || '');
              setRequestedCount(currentSearch.requestedCount || 20);
              setWebsiteFilter(currentSearch.websiteFilter || 'ALL');
              setSearchIdempotencyKey(crypto.randomUUID());
              setSelectedIds(new Set());
              setCurrentSearch(null);
            }} className="text-sm text-emerald-400">
              Preparar nova tentativa
            </button>
          ) : (
            <button type="button" onClick={() => handleOpenHistoricalSearch(currentSearch.id)} className="text-sm text-emerald-400">
              Atualizar andamento
            </button>
          )}
        </div>
      )}

      {currentSearch?.status === 'COMPLETED' && (
        <div className="dash-card p-5 rounded-2xl border border-white/[0.08] space-y-4">
          {currentSearch.usableCount === 0 && <p className="rounded-xl border border-[var(--studio-line)] p-4 text-sm text-[var(--studio-muted)]">Nenhuma empresa elegível nesta busca. Telefones fixos, duplicados e empresas fora do filtro são descartados. Tente outro segmento ou região.</p>}
          {/* Métricas do Resultado */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
            <div>
              <span className="text-[11px] text-[var(--studio-muted)] uppercase tracking-wider block">Resultado da Consulta</span>
              <h3 className="text-sm font-semibold text-white mt-0.5">
                {currentSearch.query}
              </h3>
              <p className="text-xs text-[var(--studio-muted)] mt-1">{websiteFilterLabel(currentSearch.websiteFilter)} · cidade confirmada · somente celulares</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-semibold">
                {currentSearch.usableCount} Aproveitáveis
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[var(--studio-muted)] text-xs font-mono">
                {currentSearch.discardedCount} Descartadas
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-mono">
                {currentSearch.creditsConsumed > 0 ? `${currentSearch.creditsConsumed} créditos (busca antiga)` : "Sem débito de créditos de IA"}
              </div>
            </div>
          </div>

          {/* Barra de Ações em Lote */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleSelectAllUsable}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
              >
                {selectedIds.size === currentSearch.results.filter(r => r.isUsable).length
                  ? "Desmarcar todas"
                  : "Selecionar todas as aptas"}
              </button>
              <span className="text-xs text-[var(--studio-muted)]">
                <strong>{selectedIds.size}</strong> de {currentSearch.usableCount} selecionadas
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {campaigns.length > 0 && (
                <>
                  <select
                    value={targetCampaignId}
                    onChange={(e) => setTargetCampaignId(e.target.value)}
                    className="px-3 py-1.5 dash-input rounded-xl text-xs text-[var(--studio-ink)] bg-[var(--studio-surface)]"
                  >
                    <option value="">Selecionar Campanha Existente...</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.status})
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleAddToCampaign}
                    disabled={isAdding || !targetCampaignId || selectedIds.size === 0}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  >
                    {isAdding ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
                    <span>Adicionar à Campanha</span>
                  </button>
                </>
              )}

              {onOpenCreateCampaignWithLeads && (
                <button
                  type="button"
                  onClick={handleCreateNewCampaignFromResults}
                  disabled={selectedIds.size === 0}
                  className="px-3 py-1.5 bg-white/[0.08] hover:bg-white/[0.12] text-white font-medium rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <Layers size={12} className="text-emerald-400" />
                  <span>Criar campanha com selecionadas</span>
                </button>
              )}
            </div>
          </div>

          {/* Tabela de Empresas Encontradas */}
          <div className="overflow-x-auto max-h-[460px] overflow-y-auto border border-white/[0.06] rounded-xl">
            <table className="w-full text-left text-xs text-[var(--studio-muted)]">
              <thead className="sticky top-0 bg-[var(--studio-surface)] text-[var(--studio-muted)] uppercase text-[10px] tracking-wider border-b border-white/[0.08]">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        currentSearch.usableCount > 0 &&
                        selectedIds.size === currentSearch.results.filter(r => r.isUsable).length
                      }
                      onChange={toggleSelectAllUsable}
                      className="rounded accent-emerald-500"
                    />
                  </th>
                  <th className="p-3">Empresa</th>
                  <th className="p-3">Telefone / WhatsApp</th>
                  <th className="p-3">Bairro / Endereço</th>
                  <th className="p-3">Avaliação</th>
                  <th className="p-3 text-right">Status do Lead</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {currentSearch.results.map((company) => {
                  const isChecked = selectedIds.has(company.id);
                  return (
                    <tr
                      key={company.id}
                      className={`hover:bg-white/[0.02] transition-colors ${
                        !company.isUsable ? "opacity-60 bg-red-500/[0.02]" : ""
                      }`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          disabled={!company.isUsable}
                          checked={isChecked}
                          onChange={() => toggleSelect(company.id)}
                          className="rounded accent-emerald-500 disabled:opacity-30"
                        />
                      </td>

                      <td className="p-3 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <span>{company.name}</span>
                          {company.hasWebsite && company.website && (
                            <a
                              href={company.website}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[var(--studio-muted)] hover:text-emerald-400"
                              title={company.website}
                            >
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                        <span className={`mt-1 inline-block rounded px-2 py-0.5 text-[10px] ${company.hasWebsite ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-[var(--studio-muted)]'}`}>
                          {company.hasWebsite ? 'Com site' : 'Sem site informado'}
                        </span>
                        {company.category && (
                          <span className="text-[10px] text-[var(--studio-muted)] block">{company.category}</span>
                        )}
                      </td>

                      <td className="p-3">
                        {company.phone ? (
                          <div className="flex items-center gap-1.5 font-mono text-emerald-300">
                            <Phone size={12} className="text-emerald-400" />
                            <span>{company.phone}</span>
                          </div>
                        ) : (
                          <span className="text-[var(--studio-muted)] italic">Sem telefone informado</span>
                        )}
                      </td>

                      <td className="p-3 text-[var(--studio-muted)]">
                        {company.neighborhood || company.city || "—"}
                      </td>

                      <td className="p-3">
                        {company.rating ? (
                          <div className="flex items-center gap-1 text-amber-300 font-mono text-[11px]">
                            <Star size={11} className="fill-amber-400 text-amber-400" />
                            <span>{company.rating}</span>
                            {company.reviewsCount && (
                              <span className="text-[var(--studio-muted)] text-[10px]">({company.reviewsCount})</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        {company.isUsable ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 size={11} />
                            Apto
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                            <AlertCircle size={11} />
                            {company.discardReason === 'NO_PHONE' && 'Sem telefone'}
                            {company.discardReason === 'DUPLICATE' && 'Duplicado'}
                            {company.discardReason === 'BLACKLISTED' && 'Bloqueado LGPD'}
                            {company.discardReason === 'INVALID_PHONE' && 'Número inválido'}
                            {company.discardReason === 'WEBSITE_FILTER' && 'Fora do filtro de site'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </section>

      {/* Histórico das Últimas Buscas */}
      {history.length > 0 && (
        <div className="xl:col-span-full dash-card p-5 rounded-2xl border border-white/[0.08] space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-[var(--studio-muted)] uppercase tracking-wider flex items-center gap-2">
              <Layers size={13} className="text-emerald-400" />
              <span>Histórico de Buscas do Workspace</span>
            </h4>
            {loadingHistory ? (
              <RefreshCw size={12} className="animate-spin text-emerald-400" />
            ) : (
              <span className="text-[11px] text-[var(--studio-muted)] font-mono">{history.length} buscas</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {history.slice(0, 6).map((h) => (
              <div
                key={h.id}
                onClick={() => handleOpenHistoricalSearch(h.id)}
                className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] hover:border-emerald-500/30 transition-all cursor-pointer space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white truncate max-w-[200px]">
                    {h.segment}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    {h.status === 'COMPLETED' ? `${h.usableCount} aptas` : h.status === 'FAILED' ? 'Falhou' : h.status === 'CANCELED' ? 'Cancelada' : 'Processando'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[var(--studio-muted)]">
                  <span className="truncate">{h.location}</span>
                  <span className="font-mono text-[10px] text-[var(--studio-muted)]">
                    {new Date(h.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--studio-muted)]">{websiteFilterLabel(h.websiteFilter)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
