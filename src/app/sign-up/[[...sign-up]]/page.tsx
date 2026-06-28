import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#f8f9fc]">
      <SignUp
        forceRedirectUrl="/"
        signInUrl="/sign-in"
      />
    </div>
  );
}
