// Pure helpers extracted from AudioBubble. Behaviour preserved verbatim.

// Format time helper
export const formatTime = (time) => {
  if (!time || isNaN(time)) return '0:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Exercise-based music sync
export const getExerciseBasedMusic = (exercise) => {
  if (!exercise) return null;

  const exerciseType = exercise.type?.toLowerCase();
  const intensity = exercise.intensity?.toLowerCase();

  let bpm = 120; // Default BPM
  let genre = 'workout';

  switch (exerciseType) {
    case 'cardio':
    case 'hiit':
      bpm = intensity === 'high' ? 140-160 : 120-140;
      genre = 'electronic,dance,pop';
      break;
    case 'strength':
    case 'powerlifting':
      bpm = 100-130;
      genre = 'rock,metal,hip-hop';
      break;
    case 'yoga':
    case 'stretching':
      bpm = 60-90;
      genre = 'ambient,chill,classical';
      break;
    case 'functional':
      bpm = 110-130;
      genre = 'pop,rock,electronic';
      break;
    default:
      bpm = 120;
      genre = 'workout';
  }

  return { bpm, genre, exerciseType };
};
