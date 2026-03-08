"use client";

import { useRouter } from "next/navigation";

import withLogout from "@/global/auth/hoc/withLogout";
import { useAuthContext } from "@/global/auth/hooks/useAuth";
import client from "@/global/backend/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

import { Lock, LogIn, User } from "lucide-react";

const loginFormSchema = z.object({
  username: z
    .string()
    .min(1, "아이디를 입력해주세요.")
    .min(2, "아이디는 2자 이상이어야 합니다.")
    .max(30, "아이디는 30자 이하여야 합니다."),
  password: z
    .string()
    .min(1, "비밀번호를 입력해주세요.")
    .min(2, "비밀번호는 2자 이상이어야 합니다.")
    .max(30, "비밀번호는 30자 이하여야 합니다."),
});

type LoginFormInputs = z.infer<typeof loginFormSchema>;

export default withLogout(function Page() {
  const router = useRouter();
  const { setLoginMember } = useAuthContext();

  const form = useForm<LoginFormInputs>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormInputs) => {
    const response = await client.POST("/member/api/v1/auth/login", {
      body: {
        username: data.username,
        password: data.password,
      },
    });

    if (response.error) {
      toast.error(response.error.msg);
      return;
    }

    toast.success(response.data.msg);
    setLoginMember(response.data.data.item);
    router.replace("/");
  };

  return (
    <div className="container mx-auto px-4 py-8 flex-1 flex items-center justify-center max-w-md">
      <Card className="w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <LogIn className="w-6 h-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">관리자 로그인</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      아이디
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="text"
                        placeholder="아이디를 입력하세요"
                        autoFocus
                        autoComplete="off"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      비밀번호
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="비밀번호를 입력하세요"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                <LogIn className="w-4 h-4" />
                {form.formState.isSubmitting ? "로그인 중..." : "로그인"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
});
