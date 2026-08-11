import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

export const Route = createFileRoute('/api/public/reset-password')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json();
        const schema = z.object({ email: z.string().email() });
        const { email } = schema.parse(body);

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (listError) {
          return new Response(JSON.stringify({ error: `Failed to list users: ${listError.message}` }), { status: 500 });
        }
        
        const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
        
        if (!user) {
          return new Response(JSON.stringify({
            email,
            found: false,
            message: "User not found",
            available: users.map(u => u.email)
          }), { status: 404 });
        }
        
        const userId = user.id;
        
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";
        let password = "";
        password += "ABC"[Math.floor(Math.random() * 3)];
        password += "abc"[Math.floor(Math.random() * 3)];
        password += "123"[Math.floor(Math.random() * 3)];
        password += "!@#"[Math.floor(Math.random() * 3)];
        
        for (let i = 0; i < 12; i++) {
          password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        password = password.split('').sort(() => 0.5 - Math.random()).join('');
        
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          userId,
          { password }
        );
        
        if (updateError) {
          return new Response(JSON.stringify({ error: `Failed to update password: ${updateError.message}` }), { status: 500 });
        }
        
        const { data: { user: updatedUser }, error: getError } = await supabaseAdmin.auth.admin.getUserById(userId);
        
        if (getError || !updatedUser) {
          return new Response(JSON.stringify({ error: "Failed to verify user after update" }), { status: 500 });
        }
        
        return new Response(JSON.stringify({
          email: updatedUser.email,
          userId: updatedUser.id,
          passwordChanged: true,
          newPassword: password,
          emailSame: updatedUser.email?.toLowerCase() === email.toLowerCase(),
          userIdSame: updatedUser.id === userId,
          found: true
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }
  }
});
