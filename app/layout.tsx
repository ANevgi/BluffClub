import './globals.css';
import type {Metadata} from 'next';
export const metadata:Metadata={title:'Bluff Club — Humans vs AI',description:'A live party game with one suspicious robot.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
