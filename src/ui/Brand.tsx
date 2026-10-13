export const APP_NAME = 'hunet vids';

/** hunet wordmark + "vids". */
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? 'small' : ''}`} aria-label={APP_NAME}>
      <img src="/hunet-logo.png" alt="hunet" />
      <span className="vids">vids</span>
    </span>
  );
}
