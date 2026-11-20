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
        className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-[#CBE4DB] bg-white font-medium text-[#0F2A2A] shadow-xs transition-colors hover:bg-[#F2F9F6] whitespace-nowrap shrink-0 ${
          compact ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-xs'
        }`}
      >
        <Download className="h-3.5 w-3.5 shrink-0 text-[#0C947E]" />
        <span>{isInstallable ? 'Instalar app' : 'Instalar no celular'}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F2A2A]/45 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-[#E1EEE9] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#E5F1EC] pb-4">
              <div className="flex items-center gap-3">
                <img
                  src="/app-logo.png"
                  alt="PRATO & TREINO"
                  className="h-10 w-10 shrink-0 rounded-xl object-cover"
                />
                <div>
                  <h3 className="font-display text-lg font-semibold text-[#0F2A2A]">
                    Instalar direto no celular
                  </h3>
                  <p className="text-xs text-[#648482]">Sem precisar passar pela Play Store</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-[#5C7B79] hover:bg-[#F2F9F6] hover:text-[#0F2A2A]"
                aria-label="Fechar guia de instalação"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4 text-sm text-[#2E4A48]">
              {!isIOS ? (
                <div className="rounded-xl border border-[#DCECE6] bg-[#F4FAF7] p-4">
                  <p className="font-semibold text-[#0C947E]">No Android (Chrome / Edge / Brave)</p>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-[#4B6B68]">
                    <li>Abra a URL deste aplicativo diretamente no Chrome do seu celular (fora da prévia embutida).</li>
                    <li>Toque no menu <strong>⋮</strong> (três pontinhos no canto superior direito).</li>
                    <li>Toque em <strong>Adicionar à tela inicial</strong> ou <strong>Instalar aplicativo</strong>.</li>
                    <li>O ícone do <strong>PRATO &amp; TREINO</strong> aparecerá na sua tela como um app nativo em tela cheia.</li>
                  </ol>
                </div>
              ) : (
                <div className="rounded-xl border border-[#DCECE6] bg-[#F4FAF7] p-4">
                  <p className="font-semibold text-[#0C947E]">No iPhone / iPad (Safari)</p>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-[#4B6B68]">
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
                  className="w-full rounded-xl bg-[#12BFA3] py-3 text-sm font-semibold text-white hover:bg-[#0EA88F]"
                >
                  Instalar agora
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="w-full rounded-xl border border-[#D3E5DF] py-2.5 text-xs font-medium text-[#2E4A48] hover:bg-[#F2F9F6]"
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
    <div className="fixed bottom-20 left-4 right-4 z-50 flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800 shadow-md backdrop-blur-md lg:bottom-4 lg:left-auto lg:right-4">
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>Modo offline — visualizando dados em cache.</span>
    </div>
  );
}
