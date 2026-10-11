import { loadEnvConfig } from '@next/env';
const projectDir = process.cwd();
loadEnvConfig(projectDir);


import { createClient } from '@supabase/supabase-js';
import { processWhatsAppSessionWithAI } from './src/lib/ai/whatsappAssistant';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runTest() {
  console.log('🚀 Starting WhatsApp AI Test...');

  const phone = '+96170407966';
  
  console.log(`📱 Creating session for phone: ${phone}`);
  const { data: session, error: sessionError } = await supabase
    .from('whatsapp_sessions')
    .insert([{ 
      customer_phone: phone,
      whatsapp_business_number: 'line_1',
      session_status: 'active',
    }])
    .select()
    .single();

  if (sessionError || !session) {
    console.error('❌ Failed to create session', sessionError);
    return;
  }

  const sessionId = session.id;
  console.log(`✅ Session created: ${sessionId}`);

  // Customer message to the Taxi Bot
  const messages = [
    { session_id: sessionId, direction: 'inbound', message_type: 'text', raw_text: 'Hi, I need a taxi from Beirut to Jounieh for 2 passengers' },
  ];

  console.log('💬 Inserting messages...');
  const { error: msgError } = await supabase.from('whatsapp_messages').insert(messages);
  if (msgError) {
    console.error('❌ Failed to insert messages', msgError);
    return;
  }

  console.log('🤖 Processing session with AI...');
  try {
    await processWhatsAppSessionWithAI(sessionId);
    console.log('✅ AI Processing complete');
  } catch (error) {
    console.error('❌ AI Processing failed:', error);
  }

  console.log('🔍 Fetching updated session...');
  const { data: updatedSession, error: updateError } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (updateError) {
    console.error('❌ Failed to fetch updated session', updateError);
    return;
  }

  console.log('\n=======================================');
  console.log('🎉 RESULTING SESSION STATE:');
  console.log('Status:', updatedSession.session_status);
  console.log('Detected Intent:', updatedSession.detected_intent);
  console.log('Extracted Pickup:', updatedSession.extracted_pickup);
  console.log('Extracted Destination:', updatedSession.extracted_destination);
  console.log('Missing Fields:', updatedSession.missing_fields);
  console.log('Suggested Reply:', updatedSession.suggested_operator_reply);
  console.log('=======================================\n');
}

runTest();
