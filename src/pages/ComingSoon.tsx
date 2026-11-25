import { useLocation } from 'react-router-dom';
import { NAV } from '@/components/nav';
import { Empty, PageHeader } from '@/components/ui';
import { useT } from '@/lib/i18n';
export default function ComingSoon() {
  const loc = useLocation(); const t = useT(); const n = NAV.find((x) => x.to === loc.pathname);
  return <><PageHeader title={t(n?.label ?? 'Not found')} /><Empty title={n ? `Planned for Phase ${n.phase}` : 'Page not found'}>{n ? 'This module is not built yet. Your existing data is unaffected.' : ''}</Empty></>;
}
