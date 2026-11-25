import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout, MorePage } from '@/components/Layout';
import { UIProvider } from '@/components/UIContext';
import { Loading } from '@/components/ui';
import { NAV } from '@/components/nav';
import Dashboard from '@/pages/Dashboard';
const Transactions = lazy(() => import('@/pages/Transactions'));
const Accounts = lazy(() => import('@/pages/Accounts'));
const Settings = lazy(() => import('@/pages/Settings'));
const Backup = lazy(() => import('@/pages/Backup'));
const Salary = lazy(() => import('@/pages/Salary'));
const Commitments = lazy(() => import('@/pages/Commitments'));
const CalendarPage = lazy(() => import('@/pages/Calendar'));
const BudgetPage = lazy(() => import('@/pages/Budget'));
const Savings = lazy(() => import('@/pages/Savings'));
const Debts = lazy(() => import('@/pages/Debts'));
const Simulator = lazy(() => import('@/pages/Simulator'));
const Tasks = lazy(() => import('@/pages/Tasks'));
const ComingSoon = lazy(() => import('@/pages/ComingSoon'));

export default function App() {
  return (
    <BrowserRouter>
      <UIProvider>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="income" element={<Transactions key="inc" fixedType="income" />} />
              <Route path="expenses" element={<Transactions key="exp" fixedType="expense" />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="salary" element={<Salary />} />
              <Route path="commitments" element={<Commitments />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="budget" element={<BudgetPage />} />
              <Route path="savings" element={<Savings />} />
              <Route path="debts" element={<Debts />} />
              <Route path="simulator" element={<Simulator />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="settings" element={<Settings />} />
              <Route path="backup" element={<Backup />} />
              <Route path="more" element={<MorePage />} />
              {NAV.filter((n) => n.phase).map((n) => <Route key={n.to} path={n.to.slice(1)} element={<ComingSoon />} />)}
              <Route path="*" element={<ComingSoon />} />
            </Route>
          </Routes>
        </Suspense>
      </UIProvider>
    </BrowserRouter>
  );
}
