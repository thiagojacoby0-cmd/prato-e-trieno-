import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuide(true);
      }
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/12 font-medium text-[#22C55E] transition-colors hover:bg-[#22C55E]/20 whitespace-nowrap shrink-0 ${
          compact ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-xs'
        }`}
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        <span>{isInstallable ? 'Instalar app' : 'Instalar no celular'}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#111613] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#22C55E]/15 text-[#22C55E]">
                  <Smartphone className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display text-lg font-semibold text-[#F4F7F5]">
                    Instalar direto no celular
                  </h3>
                  <p className="text-xs text-[#8F9E95]">Sem precisar passar pela Play Store</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-[#9AA8A0] hover:bg-white/5 hover:text-white"
                aria-label="Fechar guia de instalação"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4 text-sm text-[#C2CCC6]">
              {!isIOS ? (
                <div className="rounded-xl border border-white/8 bg-[#0A0D0B] p-4">
                  <p className="font-medium text-[#22C55E]">No Android (Chrome / Edge / Brave)</p>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-[#9AA8A0]">
                    <li>Abra a URL deste aplicativo diretamente no Chrome do seu celular (fora da prévia embutida).</li>
                    <li>Toque no menu <strong>⋮</strong> (três pontinhos no canto superior direito).</li>
                    <li>Toque em <strong>Adicionar à tela inicial</strong> ou <strong>Instalar aplicativo</strong>.</li>
                    <li>O ícone do <strong>PRATO &amp; TREINO</strong> aparecerá na sua tela como um app nativo em tela cheia.</li>
                  </ol>
                </div>
              ) : (
                <div className="rounded-xl border border-white/8 bg-[#0A0D0B] p-4">
                  <p className="font-medium text-[#22C55E]">No iPhone / iPad (Safari)</p>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-[#9AA8A0]">
                    <li>Abra a URL deste aplicativo no navegador <strong>Safari</strong>.</li>
                    <li>Toque no botão <strong>Compartilhar</strong> na barra inferior.</li>
                    <li>Role e toque em <strong>Adicionar à Tela de Início</strong>.</li>
                  </ol>
                </div>
              )}

              {isInstallable && (
                <button
                  type="button"
                  onClick={install}
                  className="w-full rounded-xl bg-[#22C55E] py-3 text-sm font-semibold text-[#06120A] hover:bg-[#16A34A]"
                >
                  Instalar agora
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="w-full rounded-xl border border-white/10 py-2.5 text-xs font-medium text-[#C2CCC6] hover:bg-white/5"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/15 px-4 py-2.5 text-xs font-medium text-amber-200 backdrop-blur-md lg:bottom-4 lg:left-auto lg:right-4">
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>Modo offline — visualizando dados em cache.</span>
    </div>
  );
}
