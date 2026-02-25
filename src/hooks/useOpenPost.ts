import { useNavigate } from 'react-router-dom';

/**
 * Returns onClick and onAuxClick handlers for navigating to a post URL.
 * - Left click: navigate in the same tab
 * - Middle click: open in a new tab
 */
export function useOpenPost(path: string) {
  const navigate = useNavigate();

  const onClick = () => navigate(path);

  const onAuxClick = (e: React.MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    window.open(path, '_blank');
  };

  return { onClick, onAuxClick };
}
