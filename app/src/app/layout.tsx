import type {Metadata} from "next";
import {ApplicationProvider} from "../components/screens";
import "./globals.css";
export const metadata:Metadata={title:"U+ 요금제",description:"나에게 맞는 요금제 선택과 구독 신청"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ko"><body><div className="app-frame"><ApplicationProvider>{children}</ApplicationProvider></div></body></html>;}
