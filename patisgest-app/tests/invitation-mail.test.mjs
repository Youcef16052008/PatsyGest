import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SMTPServer } from 'smtp-server';
import { notifierInvitationLocale } from '../src/lib/invitation-mail.ts';

const env={NODE_ENV:'development',PATSYGEST_EQUIPE_EXPERIMENTAL:'true',PATSYGEST_TEST_INVITATION_EMAIL:'true',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321'};
test('notification SMTP uniquement locale, facultative et destinée à une adresse fictive', async () => {
 const messages=[];
 const server=new SMTPServer({authOptional:true,disabledCommands:['AUTH','STARTTLS'],onData(stream,session,done){
  let body=''; stream.on('data',chunk=>body+=chunk); stream.on('end',()=>{messages.push({body,recipient:session.envelope.rcptTo.map(x=>x.address)}); done();});
 }});
 await new Promise((resolve,reject)=>server.once('error',reject).listen(54325,'127.0.0.1',resolve));
 try {
  assert.equal(await notifierInvitationLocale('candidat@example.test',env),'acceptee_smtp_test');
  assert.equal(messages.length,1); assert.deepEqual(messages[0].recipient,['candidat@example.test']);
  assert.match(messages[0].body,/aucun lien de connexion/i);
  for(const address of ['personne@gmail.com','a@example.test.evil.test','x\r\nBcc:evil@example.test','x@example.org']) {
   assert.equal(await notifierInvitationLocale(address,env),'destinataire_refuse');
  }
  assert.equal(await notifierInvitationLocale('candidat@example.test',{...env,PATSYGEST_TEST_INVITATION_EMAIL:'false'}),'non_configuree');
  assert.equal(await notifierInvitationLocale('candidat@example.test',{...env,NODE_ENV:'production'}),'non_configuree');
  assert.equal(await notifierInvitationLocale('candidat@example.test',{...env,VERCEL_ENV:'preview'}),'non_configuree');
  assert.equal(await notifierInvitationLocale('candidat@example.test',{...env,NEXT_PUBLIC_SUPABASE_URL:'https://pilote.supabase.co'}),'non_configuree');
  assert.equal(messages.length,1,'Aucun autre courrier ne doit être envoyé');
 } finally {await new Promise(resolve=>server.close(resolve));}
 assert.equal(await notifierInvitationLocale('candidat@example.test',env),'echec','Serveur arrêté : l’envoi ne doit pas être déclaré réussi');
});
