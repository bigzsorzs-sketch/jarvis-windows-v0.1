import TalkingAvatar from '@/components/avatar/TalkingAvatar';

export default function AssistantAvatar3D({ expression = 'neutral', avatarUrl = '' }) {
  return (
    <div className="mx-auto h-[34vh] min-h-[245px] max-h-[335px] w-full overflow-hidden">
      <TalkingAvatar avatarUrl={avatarUrl} externalExpression={expression} enableVoice={false} compact />
    </div>
  );
}