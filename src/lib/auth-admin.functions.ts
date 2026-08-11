import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const resetUserPassword = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ email: z.string().email() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // 1. Locate the user
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      throw new Error(`Failed to list users: ${listError.message}`);
    }
    
    const user = users.find(u => u.email === data.email);
    
    if (!user) {
      return {
        email: data.email,
        found: false,
        message: "User not found"
      };
    }
    
    const userId = user.id;
    
    // 2. Generate strong temporary password
    // 14+ chars, upper, lower, number, special
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";
    let password = "";
    // Ensure at least one of each required type
    password += "ABC"[Math.floor(Math.random() * 3)];
    password += "abc"[Math.floor(Math.random() * 3)];
    password += "123"[Math.floor(Math.random() * 3)];
    password += "!@#"[Math.floor(Math.random() * 3)];
    
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Shuffle the password
    password = password.split('').sort(() => 0.5 - Math.random()).join('');
    
    // 3. Update the password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password }
    );
    
    if (updateError) {
      throw new Error(`Failed to update password: ${updateError.message}`);
    }
    
    // 4. Verify user still exists with same email/id (implicit by successful update but let's be sure)
    const { data: { user: updatedUser }, error: getError } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (getError || !updatedUser) {
      throw new Error("Failed to verify user after update");
    }
    
    return {
      email: updatedUser.email,
      userId: updatedUser.id,
      passwordChanged: true,
      newPassword: password,
      emailSame: updatedUser.email === data.email,
      userIdSame: updatedUser.id === userId,
      found: true
    };
  });
