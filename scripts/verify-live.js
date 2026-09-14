async function run() {
  console.log('1. Seeding demo video via POST /api/demo/seed...');
  const seedRes = await fetch('http://localhost:3000/api/demo/seed', { method: 'POST' });
  const seedData = await seedRes.json();
  console.log('Seed response:', { success: seedData.success, videoId: seedData.video?.id });
  const videoId = seedData.video.id;

  console.log('2. Waiting for indexing to finish...');
  let indexed = false;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const vRes = await fetch(`http://localhost:3000/api/videos/${videoId}`);
    const vData = await vRes.json();
    console.log(`Video status: ${vData.video?.status} | Progress: ${vData.video?.processingProgress}% | Scenes: ${vData.scenes?.length}`);
    if (vData.video?.status === 'indexed') {
      indexed = true;
      break;
    }
  }

  if (!indexed) throw new Error('Video indexing timed out');

  console.log('3. Searching for "Find the fight scene"...');
  const searchRes = await fetch(`http://localhost:3000/api/videos/${videoId}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'Find the fight scene', autoVerify: true }),
  });
  const searchData = await searchRes.json();
  console.log(`Search matches found: ${searchData.results?.length}`);
  const topMatch = searchData.results?.[0];
  console.log('Top match details:', {
    description: topMatch?.description,
    similarity: `${topMatch?.similarityScore}%`,
    isVerified: topMatch?.isVerified,
    start: `${topMatch?.verifiedStartTime}s`,
    end: `${topMatch?.verifiedEndTime}s`,
    reason: topMatch?.verificationReason,
  });

  console.log('4. Creating clip from top verified match...');
  const clipRes = await fetch(`http://localhost:3000/api/videos/${videoId}/clips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startTime: topMatch.verifiedStartTime,
      endTime: topMatch.verifiedEndTime,
      sceneId: topMatch.sceneId,
      query: 'Find the fight scene',
    }),
  });
  const clipData = await clipRes.json();
  const clipId = clipData.clip?.id;
  console.log(`Clip queued: ${clipId}`);

  console.log('5. Waiting for FFmpeg clip rendering...');
  let clipReady = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const cRes = await fetch(`http://localhost:3000/api/clips/${clipId}`);
    const cData = await cRes.json();
    console.log(`Clip status: ${cData.clip?.status} | Progress: ${cData.clip?.progress}%`);
    if (cData.clip?.status === 'completed') {
      clipReady = true;
      console.log(`CLIP RENDERED! Duration: ${cData.clip.duration}s | Output: ${cData.clip.outputPath}`);
      break;
    }
  }

  if (!clipReady) throw new Error('Clip rendering timed out');

  console.log('\n======================================================');
  console.log('🎉 LIVE END-TO-END PIPELINE VALIDATION PASSED 100%!');
  console.log('======================================================\n');
}

run().catch((err) => {
  console.error('Live verification failed:', err);
  process.exit(1);
});
