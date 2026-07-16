/**
 * Filet de sécurité pour toute erreur de rendu React non rattrapée —
 * jusqu'ici, un bug dans N'IMPORTE QUEL composant (un cas limite jamais
 * testé, une page aux données inattendues…) démontait tout l'arbre React et
 * laissait une fenêtre blanche, sans recours sinon forcer la fermeture et
 * relancer toute l'application. Un rechargement de LA FENÊTRE (`location.reload()`)
 * suffit à repartir d'un état propre — le process main, la base de données et
 * les autres fenêtres ne sont pas affectés.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('ÆTHER — erreur de rendu non rattrapée :', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid h-screen w-screen place-items-center bg-void text-ink">
        <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
          <span className="select-none font-display text-[56px] leading-none text-ink-faint/40">Æ</span>
          <div>
            <p className="font-display text-[16px] italic text-ink-dim">Un problème est survenu</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-faint">
              L&rsquo;interface a rencontré une erreur inattendue. Vos espaces, pages et données restent
              intacts — recharger suffit généralement à repartir normalement.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-glacier/90 px-5 py-2 text-[12.5px] font-medium text-ink-onaccent transition-colors hover:bg-glacier"
          >
            Recharger
          </button>
        </div>
      </div>
    )
  }
}
