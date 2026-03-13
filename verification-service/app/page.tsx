import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect root to main DAON site
  redirect('https://daon.network');
}
