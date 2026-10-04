import GameScreen from '../components/game-screen';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <GameScreen initialKind={params.game === 'ttt' ? 'ttt' : 'rps'} initialRoom={typeof params.room === 'string' ? params.room : ''} />;
}
