import React from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}