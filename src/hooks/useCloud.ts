import { useEffect, useState } from 'react';
import { getCloudState, subscribeCloud, type CloudState } from '@/lib/cloud';
export function useCloud(): CloudState { const [s, set] = useState(getCloudState()); useEffect(() => subscribeCloud(set), []); return s; }
