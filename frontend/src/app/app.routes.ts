import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth';
import { Shell } from './layout/shell';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login').then((m) => m.LoginPage), title: 'Sign in · DARES PUE' },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard').then((m) => m.DashboardPage), title: 'Dashboard · DARES PUE' },
      { path: 'map', loadComponent: () => import('./pages/map').then((m) => m.MapPage), title: 'Live map · DARES PUE' },
      { path: 'devices', loadComponent: () => import('./pages/devices').then((m) => m.DevicesPage), title: 'Pumps · DARES PUE' },
      { path: 'devices/:id', loadComponent: () => import('./pages/device-detail').then((m) => m.DeviceDetailPage), title: 'Pump · DARES PUE' },
      { path: 'farmers', loadComponent: () => import('./pages/farmers').then((m) => m.FarmersPage), title: 'Farmers · DARES PUE' },
      { path: 'farmers/:id', loadComponent: () => import('./pages/farmer-detail').then((m) => m.FarmerDetailPage), title: 'Farmer · DARES PUE' },
      { path: 'payments', loadComponent: () => import('./pages/payments').then((m) => m.PaymentsPage), title: 'Payments · DARES PUE' },
      {
        path: 'api-clients',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/api-clients').then((m) => m.ApiClientsPage),
        title: 'API access · DARES PUE',
      },
      {
        path: 'users',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/users').then((m) => m.UsersPage),
        title: 'Users · DARES PUE',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
