import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "./lib/prisma";

type SessionWithGoogleTokens = DefaultSession & {
  googleAccessToken?: string;
  googleRefreshToken?: string;
  googleAccessTokenExpiresAt?: number;
  googleProviderAccountId?: string;
};

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  session: {
    strategy: "jwt",
  },
  providers: [
    Google({
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.readonly",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
          response_type: "code",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") {
        return true;
      }

      const email = user.email?.trim().toLowerCase();

      if (!email) {
        return false;
      }

      const tokenExpiry =
        typeof account.expires_at === "number"
          ? new Date(account.expires_at * 1000)
          : undefined;

      await prisma.$transaction(async (tx) => {
        const dbUser = await tx.user.upsert({
          where: { email },
          update: {
            ...(user.name ? { name: user.name } : {}),
          },
          create: {
            email,
            name: user.name ?? null,
          },
        });

        const existingMailConnection = await tx.mailConnection.findFirst({
          where: {
            provider: "gmail",
            OR: [
              { userId: dbUser.id },
              { email },
              ...(account.providerAccountId
                ? [{ externalAccountId: account.providerAccountId }]
                : []),
            ],
          },
          orderBy: { createdAt: "asc" },
        });

        const mailConnectionData = {
          userId: dbUser.id,
          provider: "gmail",
          email,
          externalAccountId: account.providerAccountId,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          tokenExpiry,
          scope: account.scope,
        };

        if (existingMailConnection) {
          await tx.mailConnection.update({
            where: { id: existingMailConnection.id },
            data: mailConnectionData,
          });
        } else {
          await tx.mailConnection.create({
            data: mailConnectionData,
          });
        }
      });

      return true;
    },
    async jwt({ token, account }) {
      if (account?.provider === "google") {
        token.googleAccessToken = account.access_token;
        token.googleRefreshToken =
          account.refresh_token ?? token.googleRefreshToken;
        token.googleAccessTokenExpiresAt = account.expires_at;
        token.googleProviderAccountId = account.providerAccountId;
      }

      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        googleAccessToken:
          typeof token.googleAccessToken === "string"
            ? token.googleAccessToken
            : undefined,
        googleRefreshToken:
          typeof token.googleRefreshToken === "string"
            ? token.googleRefreshToken
            : undefined,
        googleAccessTokenExpiresAt:
          typeof token.googleAccessTokenExpiresAt === "number"
            ? token.googleAccessTokenExpiresAt
            : undefined,
        googleProviderAccountId:
          typeof token.googleProviderAccountId === "string"
            ? token.googleProviderAccountId
            : undefined,
      } satisfies SessionWithGoogleTokens;
    },
  },
});
