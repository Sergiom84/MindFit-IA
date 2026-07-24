import { Outlet } from 'react-router';
import Navigation from './Navigation';

const Layout = () => {
  return (
    <div className="min-h-screen bg-black">
      <Navigation />
      <main className="pb-20">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
